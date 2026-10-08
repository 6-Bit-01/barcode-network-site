import {BROADCAST_CUT,broadcastCutStage,broadcastCutFrontStage,broadcastCutDepth,deletionDefinition,deletionPropState,deletionPose} from './deletion-library.mjs';
import {poseScale,poseFrameIndex,resolvePoseAttachments,weaponAttachment,weaponInsertionGeometry,damageOverlayPlans} from './fight-attachments.mjs';
import {easedProgress,deletionCamera,createFightCamera,advanceFightCamera} from './fight-presentation.mjs';
import {createStageRenderer} from './fight-stage-renderer.mjs';
import {createFightMotionFX} from './fight-motion-fx.mjs';
import {registerNewDeletionViews,drawNewDeletionScene,litterBoxGeometry} from './new-deletion-renderer.mjs';
import {hangingVictimPose} from './new-deletion-library.mjs';
const WIDTH = 1280;
const HEIGHT = 720;
const FLOOR = 620;
const TAU = Math.PI * 2;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function text(ctx, value, x, y, size, color, align = 'left', weight = '700', face = 'Arial, sans-serif') {
  ctx.font = `${weight} ${size}px ${face}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(String(value), x, y);
}

function barcode(ctx, x, y, width, height, color) {
  ctx.fillStyle = color;
  let cursor = x;
  let seed = 37;
  while (cursor < x + width) {
    seed = (seed * 17 + 11) % 67;
    const bar = 2 + seed % 6;
    ctx.fillRect(cursor, y, Math.min(bar, x + width - cursor), height);
    cursor += bar + 2 + seed % 4;
  }
}

function monitor(ctx, x, y, width, height, channel) {
  ctx.fillStyle = '#111113';
  ctx.fillRect(x - 7, y - 7, width + 14, height + 20);
  ctx.strokeStyle = '#35373a';
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 7, y - 7, width + 14, height + 20);
  const screen = ctx.createLinearGradient(x, y, x, y + height);
  screen.addColorStop(0, '#172022');
  screen.addColorStop(1, '#0f1418');
  ctx.fillStyle = screen;
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = '#51696844';
  ctx.lineWidth = 1;
  for (let row = 5; row < height; row += 9) {
    ctx.beginPath();
    ctx.moveTo(x, y + row);
    ctx.lineTo(x + width, y + row);
    ctx.stroke();
  }
  text(ctx, `CH ${channel}`, x + 10, y + 23, 11, '#829286', 'left', '700', 'monospace');
  barcode(ctx, x + 12, y + height - 36, width - 24, 19, '#6177743a');
  ctx.fillStyle = '#a85343';
  ctx.fillRect(x + width - 8, y + height + 6, 3, 3);
}

function stage(ctx) {
  const wall = ctx.createLinearGradient(0, 0, 0, FLOOR);
  wall.addColorStop(0, '#0f1216');
  wall.addColorStop(.4, '#20252b');
  wall.addColorStop(1, '#13171c');
  ctx.fillStyle = wall;
  ctx.fillRect(-400, -200, WIDTH + 800, HEIGHT + 400);
  const glow = ctx.createRadialGradient(640, 335, 20, 640, 355, 520);
  glow.addColorStop(0, '#73525232');
  glow.addColorStop(.55, '#3b424126');
  glow.addColorStop(1, '#12151a00');
  ctx.fillStyle = glow;
  ctx.fillRect(-400, -400, WIDTH + 800, FLOOR+400);

  for (let x = 20-156*3; x < WIDTH+400; x += 156) {
    ctx.fillStyle = '#080b10a8';
    ctx.fillRect(x, -400, 16, FLOOR+400);
    ctx.fillStyle = '#4c505c38';
    ctx.fillRect(x + 16, -400, 2, FLOOR+400);
    ctx.fillStyle = x % 3 === 0 ? '#602b3140' : '#40586327';
    ctx.fillRect(x + 20, -397, 127, FLOOR+391);
    for (let y = 130-80*6; y < FLOOR; y += 80) {
      ctx.strokeStyle = '#33363c45';
      ctx.strokeRect(x + 26, y, 114, 60);
    }
  }
  ctx.fillStyle = '#151519';
  ctx.fillRect(436, 103, 408, 62);
  ctx.strokeStyle = '#694340';
  ctx.lineWidth = 2;
  ctx.strokeRect(436, 103, 408, 62);
  text(ctx, 'ON AIR', 640, 141, 25, '#ce7d66', 'center', '900', 'monospace');
  ctx.fillStyle = '#913b31';
  ctx.fillRect(462, 126, 7, 7);
  ctx.fillRect(811, 126, 7, 7);

  // Faint studio lettering and monitor banks stay behind the intact fighter frames.
  text(ctx, 'BARCODE', 640, 307, 94, '#8880780e', 'center', '900');
  text(ctx, 'BROADCAST CONTROL / SYSTEM CLASH', 640, 338, 13, '#a797882f', 'center', '700', 'monospace');
  monitor(ctx, 70, 176, 112, 93, '06');
  monitor(ctx, 70, 298, 112, 93, '00');
  monitor(ctx, 1098, 176, 112, 93, '09');
  monitor(ctx, 1098, 298, 112, 93, '01');
  ctx.strokeStyle = '#08090dcc';
  ctx.lineWidth = 5;
  for (const x of [235, 1035]) {
    ctx.beginPath();
    ctx.moveTo(x, 101);
    ctx.bezierCurveTo(x - 48, 270, x + 40, 453, x - 8, FLOOR);
    ctx.stroke();
  }
  const floor = ctx.createLinearGradient(0, FLOOR, 0, HEIGHT);
  floor.addColorStop(0, '#27272c');
  floor.addColorStop(1, '#111419');
  ctx.fillStyle = floor;
  ctx.fillRect(-400, FLOOR, WIDTH+800, HEIGHT+200-FLOOR);
  ctx.strokeStyle = '#4e4654';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-400, FLOOR);
  ctx.lineTo(WIDTH+400, FLOOR);
  ctx.stroke();
  ctx.strokeStyle = '#655d6c30';
  ctx.lineWidth = 1;
  for (let x = -400; x <= WIDTH + 400; x += 140) {
    ctx.beginPath();
    ctx.moveTo(640 + (x - 640) * .75, FLOOR);
    ctx.lineTo(x, HEIGHT);
    ctx.stroke();
  }
  for (const y of [635, 657, 692]) {
    ctx.beginPath();
    ctx.moveTo(-400, y);
    ctx.lineTo(WIDTH+400, y);
    ctx.stroke();
  }
  ctx.fillStyle = '#69473a28';
  ctx.fillRect(-400, FLOOR + 2, WIDTH+800, 3);
}

function sourceFrame(asset, view) {
  return asset.data.frames[view.facing]?.[poseFrameIndex(asset,view)];
}

function nativeCanvas(owner, width, height) {
  const result = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width,height)
    : owner.ownerDocument?.createElement('canvas') ?? (typeof document !== 'undefined' ? document.createElement('canvas') : null);
  if (result) { result.width=width;result.height=height; }
  return result;
}

const injuryNoise=(seed,shift)=>{
  let value=((seed>>>0)^Math.imul(shift,0x9e3779b9))>>>0;
  value=Math.imul(value^(value>>>16),0x7feb352d);value=Math.imul(value^(value>>>15),0x846ca68b);
  return ((value^(value>>>16))>>>0)/4294967296;
};
function raggedStain(ctx,plan) {
  const {width:w,height:h,seed}=plan;
  const blood=ctx.createLinearGradient(0,-h*.5,0,h*.5);
  blood.addColorStop(0,'#39101b');blood.addColorStop(.48,'#751525');blood.addColorStop(1,'#3c0c17');
  // Torn brush streaks, with narrow ends and dry gaps, rather than round decals.
  const edge=[];for(let i=0;i<9;i++) {
    const t=i/8,center=(t-.45)*w*.24+(injuryNoise(seed,i*71+31)-.5)*w*.18;
    const half=w*(.05+Math.sin(t*Math.PI)*(.10+injuryNoise(seed,i*131+97)*.18));
    edge.push({x:center,half,y:(t-.5)*h});
  }
  ctx.fillStyle=blood;ctx.beginPath();edge.forEach((point,index)=>index?ctx.lineTo(point.x-point.half,point.y):ctx.moveTo(point.x-point.half,point.y));
  for(const point of edge.slice().reverse())ctx.lineTo(point.x+point.half,point.y);
  ctx.closePath();ctx.fill();
  ctx.save();ctx.globalAlpha*=.50;ctx.fillStyle='#2c111b';
  for(let i=0;i<46;i++) {
    const x=(injuryNoise(seed,i*173+27)-.5)*w*.72,y=(injuryNoise(seed,i*97+33)-.5)*h*.95;
    const grain=Math.max(.45,w*(.007+injuryNoise(seed,i*53+11)*.02));ctx.fillRect(x,y,grain,grain*2.2);
  }
  ctx.restore();ctx.lineCap='round';ctx.strokeStyle='#bc485866';ctx.lineWidth=Math.max(.55,w*.02);
  for(let i=0;i<3;i++) {const point=edge[2+i*2];ctx.beginPath();ctx.moveTo(point.x-point.half*.60,point.y);ctx.lineTo(point.x-point.half*.60+w*.025,point.y+h*.045);ctx.stroke();}
}

function drawProceduralInjury(ctx,plan) {
  const {width:w,height:h,seed,effect}=plan;
  if(effect==='stain') {raggedStain(ctx,plan);return;}
  if(effect==='wash'||effect==='scorch') {
    const gradient=ctx.createRadialGradient(0,0,0,0,0,Math.max(w,h)*.6);
    if(effect==='scorch') {
      gradient.addColorStop(0,'#0c0910');gradient.addColorStop(.48,'#342027');gradient.addColorStop(.82,'#6d3f2b70');gradient.addColorStop(1,'#18111a00');
    } else {
      gradient.addColorStop(0,plan.masked?'#10141c':'#291a31');gradient.addColorStop(.48,plan.masked?'#42465290':'#58374f88');gradient.addColorStop(1,'#24132900');
    }
    ctx.fillStyle=gradient;ctx.beginPath();ctx.ellipse(0,0,w*.54,h*.55,0,0,TAU);ctx.fill();
    if(effect==='scorch') {
      ctx.strokeStyle='#160d13';ctx.lineWidth=Math.max(1,w*.03);
      for(let i=0;i<7;i++) {
        const x=(injuryNoise(seed,i*59+37)-.5)*w*.7;
        ctx.beginPath();ctx.moveTo(x,-h*.3);ctx.lineTo(x+w*.05,-h*.04);ctx.lineTo(x-w*.035,h*.35);ctx.stroke();
      }
    }
    return;
  }
  if(effect==='drip') {
    ctx.lineCap='round';
    for(let i=0;i<3;i++) {
      const x=(i-1)*w*.23,end=h*(.35+injuryNoise(seed,i*47+13)*.2),bend=(injuryNoise(seed,i*61+7)-.5)*w*.14;
      ctx.strokeStyle=i===1?'#7f182a':'#4e101f';ctx.lineWidth=Math.max(.7,w*(i===1?.12:.07));
      ctx.beginPath();ctx.moveTo(x,-h*.45);ctx.bezierCurveTo(x+bend,-h*.1,x-bend,end*.7,x+bend,end);ctx.stroke();
      ctx.fillStyle='#8c2434';ctx.beginPath();ctx.ellipse(x+bend,end,Math.max(.7,w*.06),Math.max(1,w*.09),0,0,TAU);ctx.fill();
    }
    return;
  }
  if(effect==='tear') {
    ctx.fillStyle='#171016';ctx.beginPath();
    for(let i=0;i<9;i++) {
      const x=-w*.5+i*w/8,y=-h*(.18+injuryNoise(seed,i*19+3)*.20);
      if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
    }
    for(let i=8;i>=0;i--)ctx.lineTo(-w*.5+i*w/8,h*(.18+injuryNoise(seed,i*23+17)*.21));
    ctx.closePath();ctx.fill();
    ctx.strokeStyle='#b6a2a4ba';ctx.lineWidth=Math.max(.65,w*.013);ctx.lineCap='round';
    for(let i=0;i<11;i++) {
      const x=(i/10-.5)*w,top=i%2===0,y=(top?-1:1)*h*.25;
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+(injuryNoise(seed,i*71+5)-.5)*w*.07,y+(top?-1:1)*h*(.15+injuryNoise(seed,i*37+9)*.20));ctx.stroke();
    }
    ctx.strokeStyle='#b52d3a88';ctx.lineWidth=Math.max(1,w*.025);ctx.beginPath();ctx.moveTo(-w*.32,h*.28);ctx.lineTo(w*.28,h*.31);ctx.stroke();
  }
}

function createPoseOverlays(owner) {
  const masks=new Map(),damageLayers=new Map(),imageIds=new WeakMap();let serial=0;
  function alphaMask(asset,frame) {
    if(!imageIds.has(asset.image))imageIds.set(asset.image,++serial);
    const key=imageIds.get(asset.image)+':'+frame.rect.join(',');
    if(masks.has(key)){const cached=masks.get(key);masks.delete(key);masks.set(key,cached);return cached;}
    const [sx,sy,w,h]=frame.rect,canvas=nativeCanvas(owner,w,h);
    if(!canvas)return null;
    const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)return null;
    try {
      context.drawImage(asset.image,sx,sy,w,h,0,0,w,h);
      const data=context.getImageData(0,0,w,h).data,alpha=new Uint8Array(w*h);
      for(let i=0;i<alpha.length;i++)alpha[i]=data[i*4+3];
      const result={width:w,height:h,alpha};masks.set(key,result);
      if(masks.size>32)masks.delete(masks.keys().next().value);
      return result;
    } catch { return null; }
  }
  function opaquePoint(mask,point,radius) {
    if(!mask)return point;
    const opaque=(x,y)=>{const ix=Math.round(x),iy=Math.round(y);return ix>=0&&iy>=0&&ix<mask.width&&iy<mask.height&&mask.alpha[iy*mask.width+ix]>=160;};
    if(opaque(point.x,point.y))return point;
    for(let r=1;r<=radius;r+=1) {
      const steps=Math.max(12,Math.ceil(r*5));
      for(let i=0;i<steps;i++) {
        const a=i/steps*TAU,x=point.x+Math.cos(a)*r,y=point.y+Math.sin(a)*r;
        if(opaque(x,y))return{x,y};
      }
    }
    return null;
  }
  function legSurface(mask,point,angle,anatomy,seed,facing) {
    if(!mask)return point;
    const opaque=(x,y)=>{const ix=Math.round(x),iy=Math.round(y);return ix>=0&&iy>=0&&ix<mask.width&&iy<mask.height&&mask.alpha[iy*mask.width+ix]>=160;};
    const cos=Math.cos(angle),sin=Math.sin(angle),acrossMax=Math.ceil(anatomy*.30),alongMax=Math.ceil(anatomy*.025);
    const preferred=((seed&1)?-1:1)*(facing==='left'?-1:1);
    // Fit native lower-limb silhouettes in a narrow anatomical strip. The
    // middle cluster can be a coat flap: choose outer clusters for split legs.
    // This moves only a wound, never a body part or the underlying source art.
    const runs=[];let start=null;
    for(let across=-acrossMax;across<=acrossMax+1;across++) {
      let found=false;
      if(across<=acrossMax)for(let along=-alongMax;along<=alongMax;along++) {
        if(opaque(point.x+across*cos-along*sin,point.y+across*sin+along*cos)){found=true;break;}
      }
      if(found&&start===null)start=across;
      if(!found&&start!==null){if(across-start>=Math.max(2,anatomy*.006))runs.push({start,end:across-1});start=null;}
    }
    if(runs.length) {
      const run=runs.length>1?(preferred<0?runs[0]:runs.at(-1)):runs[0];
      const center=(run.start+run.end)/2;
      for(let along=0;along<=alongMax;along++)for(const sign of along?[1,-1]:[1]) {
        const x=point.x+center*cos-along*sign*sin,y=point.y+center*sin+along*sign*cos;
        if(opaque(x,y))return{x,y};
      }
    }
    return point;
  }
  function attachments(asset,frame,view,fighterId) {
    const index=poseFrameIndex(asset,view);
    const cached=asset.poseAttachments?.[view.facing]?.[index];if(cached)return cached;
    const result=resolvePoseAttachments(frame,view.clip,index,view.facing,fighterId),mask=alphaMask(asset,frame);
    if(result.authored) {
      // A maximum two-pixel correction accommodates anti-aliased fist edges.
      // Searching the wider silhouette used to choose a sleeve instead of a hand.
      result.grip=opaquePoint(mask,result.grip,2);
    } else {
      for(const site of ['head','torso','legs']) {
        const snapped=opaquePoint(mask,result[site],Math.ceil(result.bodyLength*.10));
        if(snapped)result[site]=snapped;
      }
      result.chest=result.torso;
      // Legacy test/unknown art can supply its own frame attachments. Actual
      // fighters cannot fall back to an estimated hand elsewhere on the body.
      result.grip=fighterId?null:opaquePoint(mask,result.grip,2);
    }
    (asset.poseAttachments??={})[view.facing]??={};asset.poseAttachments[view.facing][index]=result;
    return result;
  }
  function drawDamage(ctx,asset,frame,view,art,geometry,points,weaponArt) {
    // Pose compression must not shrink bruising or undo cumulative clothing wear.
    const anatomy=(art.manifest.height??points.bodyLength*geometry.scale)/geometry.scale;
    const [sx,sy,w,h]=frame.rect;
    if(!imageIds.has(asset.image))imageIds.set(asset.image,++serial);
    const fingerprint=JSON.stringify([view.damageTaken??0,view.damageTier??0,view.damageSites??null,
      (view.damageMarks??[]).slice(-12).map(mark=>[mark.id,mark.seed,mark.site,mark.kind,mark.intensity,mark.amount])]);
    const key=[imageIds.get(asset.image),frame.rect.join(','),art.manifest.id,view.clip,view.facing,points.index,anatomy,fingerprint].join(':');
    if(damageLayers.has(key)) {
      const cached=damageLayers.get(key);damageLayers.delete(key);damageLayers.set(key,cached);
      ctx.drawImage(cached,geometry.dx,geometry.dy,w*geometry.scale,h*geometry.scale);return;
    }
    const plans=damageOverlayPlans(view,points,art.manifest.id,anatomy);if(!plans.length)return;
    const scratch=nativeCanvas(owner,w,h);if(!scratch)return;
    const layer=scratch.getContext('2d');if(!layer)return;
    layer.clearRect(0,0,w,h);layer.globalCompositeOperation='source-over';
    const mask=alphaMask(asset,frame);
    for(const plan of plans) {
      // A split-leg site's center can be transparent while both limbs are in
      // its footprint. Draw the whole wound at its authored anatomical center;
      // final native alpha clips it, rather than dropping a valid leg injury.
      const point=plan.site==='legs'?legSurface(mask,plan.point,points.bodyAngle,anatomy,plan.anchorSeed??plan.seed,view.facing):plan.point;
      const decal=weaponArt?.damage?.manifest?.decals?.[plan.decal];
      layer.save();layer.translate(point.x,point.y);layer.rotate(plan.angle);layer.globalAlpha=plan.opacity;
      if(plan.effect!=='decal')drawProceduralInjury(layer,plan);
      else if(decal&&weaponArt.damage.image) {
        const [x,y,dw,dh]=decal.rect,height=plan.width*dh/dw;
        layer.drawImage(weaponArt.damage.image,x,y,dw,dh,-plan.width/2,-height/2,plan.width,height);
      } else {
        layer.fillStyle=plan.decal==='bruise'?'#502947':plan.decal==='cut'?'#a91730':plan.decal==='metal'?'#aebac0':'#777279';
        layer.beginPath();layer.ellipse(0,0,plan.width/2,plan.height/2,0,0,TAU);layer.fill();
        layer.strokeStyle=plan.decal==='cut'?'#d52d44':plan.decal==='metal'?'#e0e6df':'#d8c8b3';
        layer.lineWidth=Math.max(1,plan.width*.06);
        for(let i=0;i<3;i++){layer.beginPath();layer.moveTo(-plan.width*.35+i*plan.width*.13,-plan.height*.15);layer.lineTo(plan.width*.2+i*plan.width*.1,plan.height*.22);layer.stroke();}
      }
      layer.restore();
    }
    // Native sprite alpha is the final mask: no bruise, cut or tear can paint empty stage.
    layer.globalCompositeOperation='destination-in';layer.globalAlpha=1;
    layer.drawImage(asset.image,sx,sy,w,h,0,0,w,h);layer.globalCompositeOperation='source-over';
    damageLayers.set(key,scratch);if(damageLayers.size>32)damageLayers.delete(damageLayers.keys().next().value);
    ctx.drawImage(scratch,geometry.dx,geometry.dy,w*geometry.scale,h*geometry.scale);
  }
  return {attachments,drawDamage,alphaMask,opaquePoint};
}

function weaponProp(ctx,weaponArt,type,x,y,facing='right',angle=0,pivot='grip',opacity=1) {
  const spec=weaponArt?.manifest?.weapons?.[type],frame=spec?.frames?.[facing];
  if(!frame||!weaponArt.image)return;
  const [sx,sy,w,h]=frame.rect,scale=spec.drawWidth/w;
  const insertion=pivot==='insertion'?weaponInsertionGeometry(frame):null;
  const anchor=insertion?.anchor??frame[pivot]??frame.grip;
  ctx.save();ctx.globalAlpha*=opacity;ctx.translate(x,y);ctx.rotate(angle);
  if(insertion) {
    // Keep only the grip-side half-plane. The point end really disappears into
    // the chest rather than remaining pasted in full over the fighter image.
    const [ux,uy]=insertion.outward,nx=-uy,ny=ux,r=Math.hypot(w,h)*scale*2;
    ctx.beginPath();ctx.moveTo(nx*r,ny*r);ctx.lineTo(ux*r+nx*r,uy*r+ny*r);
    ctx.lineTo(ux*r-nx*r,uy*r-ny*r);ctx.lineTo(-nx*r,-ny*r);ctx.closePath();ctx.clip();
  }
  ctx.drawImage(weaponArt.image,sx,sy,w,h,-anchor[0]*scale,-anchor[1]*scale,w*scale,h*scale);ctx.restore();
}

function nativeOcclusion(ctx,asset,frame,geometry,point,rx,ry,angle=0,tipSide=0) {
  const [sx,sy,sw,sh]=frame.rect,x=geometry.dx+point.x*geometry.scale,y=geometry.dy+point.y*geometry.scale;
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,0,TAU);ctx.clip();
  if(tipSide){ctx.beginPath();ctx.rect(tipSide<0?-rx*2:0,-ry*2,rx*2,ry*4);ctx.clip();}
  ctx.rotate(-angle);ctx.translate(-x,-y);
  ctx.drawImage(asset.image,sx,sy,sw,sh,geometry.dx,geometry.dy,sw*geometry.scale,sh*geometry.scale);ctx.restore();
}

function chestEntry(ctx,x,y,angle,facing,size) {
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.strokeStyle='#3b060de0';ctx.lineWidth=3;
  ctx.beginPath();ctx.ellipse(0,0,size*.38,size*.72,0,0,TAU);ctx.stroke();
  ctx.strokeStyle='#c62b3acf';ctx.lineWidth=1.2;ctx.beginPath();ctx.ellipse(0,0,size*.48,size*.83,0,Math.PI*.12,Math.PI*1.85);ctx.stroke();
  ctx.fillStyle='#971628c9';ctx.beginPath();ctx.ellipse(facing==='left'?1.3:-1.3,size*.87,1.2,2.6,0,0,TAU);ctx.fill();ctx.restore();
}

function floorWeapons(ctx,match,weaponArt) {
  for(const item of match.stagePickups??[]) {
    const spec=weaponArt?.manifest?.weapons?.[item.type];if(!spec)continue;
    const facing=item.facing??'right',frame=spec.frames[facing],[, ,w,h]=frame.rect,scale=spec.drawWidth/w;
    const x=item.x,y=item.gripY??((item.y??FLOOR)-h*scale*.45);
    ctx.save();ctx.fillStyle=item.type==='pulse-driver'?'#b96bb527':'#72cad328';
    ctx.beginPath();ctx.ellipse(x,FLOOR+5,63,9,0,0,TAU);ctx.fill();ctx.restore();
    weaponProp(ctx,weaponArt,item.type,x,y,facing,item.angle??-.08,'grip');
    text(ctx,spec.name??item.name,x,FLOOR+30,10,item.type==='pulse-driver'?'#dda4cf':'#a2dde0','center','700','monospace');
  }
}

function projectiles(ctx,match,weaponArt,front) {
  for(const projectile of match.projectiles??[]) {
    if((projectile.kind==='pulse')!==front)continue;
    const direction=projectile.direction===-1?-1:1;
    if(projectile.kind==='pulse') {
      ctx.save();ctx.strokeStyle='#e0a4e9';ctx.lineWidth=5;ctx.lineCap='round';ctx.shadowColor='#b146ba';ctx.shadowBlur=10;
      ctx.beginPath();ctx.moveTo(projectile.x-direction*22,projectile.y);ctx.lineTo(projectile.x+direction*7,projectile.y);ctx.stroke();
      ctx.strokeStyle='#fff4fe';ctx.lineWidth=2;ctx.stroke();ctx.restore();
    } else weaponProp(ctx,weaponArt,projectile.type,projectile.x,projectile.y,direction<0?'left':'right',projectile.rotation??0,'grip');
  }
}

// Measured contours of the final intact floor poses. They identify the head
// without treating a fighter as an independently animated collection of parts.
const FALLEN_HEAD_REGIONS = {
  '6-bit':{right:[29,31,37,35],left:[215,32,37,35]},
  '9-bit':{right:[43,41,45,42],left:[267,42,44,43]},
  'cache-back':{right:[28,37,33,39],left:[260,38,31,41]},
  cliff:{right:[38,24,38,26],left:[240,25,36,28]},
  'dj-floppydisc':{right:[33,45,33,31],left:[262,43,33,32]},
  'mac-modem':{right:[34,27,34,30],left:[291,28,33,31]},
  'mr-nice-guy':{right:[48,40,44,44],left:[254,39,42,45]},
  'ms-mayhem':{right:[60,26,42,30],left:[247,26,41,30]},
  stolz:{right:[33,34,31,37],left:[271,39,31,39]},
  'kaveman-brown':{right:[32,36,34,41],left:[267,34,35,42]},
  dr3wbaby:{right:[37,32,37,33],left:[270,29,39,31]},
  'ash-flowers':{right:[35,32,36,35],left:[288,30,34,35]},
  wittyf0x:{right:[64,35,40,34],left:[280,35,39,34]},
};

function fallenHeadRegion(view,art) {
  const asset=art.clips.knockdown,fallen={...view,clip:'knockdown',elapsed:10000};
  const frame=sourceFrame(asset,fallen),index=poseFrameIndex(asset,fallen),offset=frame.offset??[0,0];
  const measured=FALLEN_HEAD_REGIONS[art.manifest.id]?.[view.facing];
  const points=resolvePoseAttachments(frame,'knockdown',index,view.facing,art.manifest.id);
  const [x,y,rx,ry]=measured??[points.head.x,points.head.y,points.bodyLength*.12,points.bodyLength*.11];
  return {x,y,rx,ry,side:points.torso.x>x?1:-1,
    world:{x:view.x+(x+offset[0]-frame.anchor[0])*poseScale(asset,frame),
      y:FLOOR+(view.y??0)+(y+offset[1]-frame.anchor[1])*poseScale(asset,frame)}};
}

// Rear boot centroids measured from the opaque native hammer keys. The entire
// baked fighter, grip and weapon tilt together around one supported foot.
const HAMMER_SUPPORT_FEET={
  right:[[25.804,482],[21.596,492],[26.020,335],[25.444,423]],
  left:[[279,471],[303.291,489],[436.898,354],[333.188,417]],
};
function hammerHeadContact(contact,art,target) {
  const asset=art.clips['delete-hammer'],frame=sourceFrame(asset,contact),index=poseFrameIndex(asset,contact);
  const support=HAMMER_SUPPORT_FEET[contact.facing]?.[index];if(!support)return null;
  const scale=poseScale(asset,frame),offset=frame.offset??[0,0],face=frame.attachments.hammerFace;
  const dx=(face[0]-support[0])*scale,dy=(face[1]-support[1])*scale;
  const radius=Math.hypot(dx,dy),phase=Math.atan2(dy,dx),sine=Math.asin(clamp((target.y-FLOOR)/radius,-1,1));
  const normalize=a=>Math.atan2(Math.sin(a),Math.cos(a));
  const candidates=[normalize(sine-phase),normalize(Math.PI-sine-phase)];
  const angle=candidates.reduce((a,b)=>Math.abs(a)<Math.abs(b)?a:b);
  return {angle:clamp(angle,-.24,.24),support,frame,scale,offset,dx,dy};
}

function deletionAftermathViews(match,views,art) {
  if(!deletionActive(match)||definitionForMatch(match)?.mechanism!=='stamp')return views;
  const definition=definitionForMatch(match),t=match.deletionElapsed;
  if(t<definition.beats.stampStrike)return views;
  const index=1-match.winner,result=views.map(view=>({...view})),victim=result[index];
  // A head strike leaves the rest of the original body where it fell, including
  // after the engine marks the loser deleted at the end of the cinematic.
  Object.assign(victim,{clip:'knockdown',elapsed:10000,y:0,opacity:1,rotation:0,
    weapon:null,aftermath:{kind:'head-crush',region:fallenHeadRegion(victim,art[index])}});
  return result;
}

function drawHeadAftermath(ctx,view,art,geometry) {
  const region=view.aftermath?.region;if(!region)return;
  const {dx,dy,scale}=geometry,x=dx+(region.x+region.side*region.rx*.90)*scale,y=dy+region.y*scale;
  ctx.save();ctx.translate(x,y);ctx.rotate(region.side<0?Math.PI:0);
  const metal=art.manifest.id==='cache-back';
  ctx.fillStyle=metal?'#202c29':'#280804';ctx.strokeStyle=metal?'#92907a':'#5f281a';ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(-5,-9);ctx.lineTo(3,-7);ctx.lineTo(6,-3);ctx.lineTo(4,7);ctx.lineTo(-4,9);ctx.lineTo(-7,3);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.fillStyle=metal?'#797768':'#77311d';ctx.beginPath();ctx.moveTo(-4,-6);ctx.lineTo(1,-4);ctx.lineTo(3,3);ctx.lineTo(-3,5);ctx.closePath();ctx.fill();
  ctx.strokeStyle=metal?'#89341d':'#b27449';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(-3,-4);ctx.lineTo(1,0);ctx.moveTo(-4,3);ctx.lineTo(-1,5);ctx.stroke();ctx.restore();
}

// Hair cleanup is a bounded alpha/color clip on the intact native source.
const FLOPPY_HAIR_CACHE=new WeakMap();
function floppyHairExclusions(owner,asset,frame,view,id) {
  if(id!=='dj-floppydisc'||view.clip.startsWith('delete-')||['pickup','crouch-punch','crouch-kick','jump-punch','jump-kick','crouch-high-kick','double-punch','power-kick'].includes(view.clip))return [];
  if(FLOPPY_HAIR_CACHE.has(frame))return FLOPPY_HAIR_CACHE.get(frame);
  const [sx,sy,w,h]=frame.rect,canvas=nativeCanvas(owner,w,h),rects=[];if(!canvas)return rects;
  try {
    const layer=canvas.getContext('2d',{willReadFrequently:true});layer.drawImage(asset.image,sx,sy,w,h,0,0,w,h);
    const data=layer.getImageData(0,0,w,h).data,blue=new Uint8Array(w*h),visited=new Uint8Array(w*h);
    for(let i=0;i<blue.length;i++){const k=i*4,r=data[k],g=data[k+1],b=data[k+2];blue[i]=data[k+3]>100&&b>70&&g>35&&b>r*1.35&&b>g*.95?1:0;}
    const neighbors=i=>[i-1,i+1,i-w,i+w].filter(n=>n>=0&&n<w*h&&Math.abs(n%w-i%w)<=1);
    let glasses=[];
    for(let i=0;i<blue.length;i++)if(blue[i]&&!visited[i]){const component=[],queue=[i];visited[i]=1;for(let q=0;q<queue.length;q++){const j=queue[q];component.push(j);for(const n of neighbors(j))if(!visited[n]&&blue[n]){visited[n]=1;queue.push(n);}}if(component.length>glasses.length)glasses=component;}
    if(glasses.length<8)return rects;
    const cx=glasses.reduce((n,i)=>n+i%w,0)/glasses.length,cy=glasses.reduce((n,i)=>n+Math.floor(i/w),0)/glasses.length;
    const points=resolvePoseAttachments(frame,view.clip,poseFrameIndex(asset,view),view.facing,id),tx=points.torso.x-cx,ty=points.torso.y-cy,length=Math.hypot(tx,ty);if(length<15)return rects;
    const down={x:tx/length,y:ty/length},face=view.facing==='left'?-1:1,back={x:-down.y*face,y:down.x*face};
    const projected=glasses.map(i=>(i%w-cx)*back.x+(Math.floor(i/w)-cy)*back.y),glassSpan=Math.max(10,Math.max(...projected)-Math.min(...projected));
    const candidate=new Uint8Array(w*h),removed=new Uint8Array(w*h),queue=[];
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,k=i*4,r=data[k],g=data[k+1],b=data[k+2],a=data[k+3],posterior=(x-cx)*back.x+(y-cy)*back.y,along=(x-cx)*down.x+(y-cy)*down.y;
      // Restrict to warm brown exterior nape, behind/below the actual blue lenses.
      // Skin, white collars, glasses and cool black waistcoats remain original.
      if(a>20&&r<118&&g<101&&b<88&&r>g+3&&g>b+1&&r<g*2.15&&posterior>glassSpan*.93&&posterior<glassSpan*2.35&&along>glassSpan*.18&&along<glassSpan*2.1)candidate[i]=1;}
    for(let i=0;i<candidate.length;i++)if(candidate[i]&&neighbors(i).some(n=>data[n*4+3]<30)){removed[i]=1;queue.push(i);}
    for(let q=0;q<queue.length;q++)for(const n of neighbors(queue[q]))if(candidate[n]&&!removed[n]){removed[n]=1;queue.push(n);}
    for(let y=0;y<h;y++){let start=-1;for(let x=0;x<=w;x++){if(x<w&&removed[y*w+x]&&start<0)start=x;if((x===w||!removed[y*w+x])&&start>=0){rects.push([start,y,x-start,1]);start=-1;}}}
    FLOPPY_HAIR_CACHE.set(frame,rects);return rects;
  } catch {return rects;}
}

function fighter(ctx, view, art, overlays, weaponArt, hide = false, motion) {
  if (!view || !art || hide) {motion?.fx.drawBody(ctx,{key:motion.key,eligible:false});return;}
  const asset = art.clips?.[view.clip];
  if (!asset?.image || !asset.data?.frames) throw new Error(`${art.manifest.character??art.manifest.id}: ${view.clip} animation is unavailable.`);
  const frame = sourceFrame(asset, view);
  if (!frame) return;
  const scale = poseScale(asset,frame);
  const offset = frame.offset ?? [0, 0];
  const [sx, sy, sw, sh] = frame.rect;
  if(view.splitBody){motion?.fx.drawBody(ctx,{key:motion.key,eligible:false});if(view.splitPieces?.length===2){for(const piece of view.splitPieces)fighter(ctx,{...view,...piece,splitBody:null,splitPieces:null},art,overlays,weaponArt,hide);}else for(const side of [-1,1]){ctx.save();ctx.translate(side*view.splitBody.gap,0);fighter(ctx,{...view,splitBody:null,halfMask:side},art,overlays,weaponArt,hide);ctx.restore();}return;}
  const feetX = view.x ?? 640;
  const feetY = FLOOR + (view.y ?? 0);
  const dx = feetX + (offset[0] - frame.anchor[0]) * scale;
  const dy = feetY + (offset[1] - frame.anchor[1]) * scale;
  const points=overlays.attachments(asset,frame,view,art.manifest.id),geometry={dx,dy,scale};
  const sourceExclusions=[...(frame.sourceExclusions??[]),...floppyHairExclusions(ctx.canvas,asset,frame,view,art.manifest.id)];
  if(motion) {
    const native=motion.native?.frames?.[view.facing]?.[poseFrameIndex(asset,view)];
    const world=point=>point?{x:feetX+point.x,y:feetY+point.y}:null;
    const authored=point=>Array.isArray(point)?{x:dx+point[0]*scale,y:dy+point[1]*scale}:null;
    // Lyra's noncontact kick keys mark the guard hand; only the extension
    // marks the paw. Those different body parts cannot share a wind trail.
    const strike=frame.attachments?.strike,grip=frame.attachments?.grip;
    const guardStrike=art.manifest.id==='lyra'&&view.clip.includes('kick')&&strike&&grip
      &&Math.hypot(strike[0]-grip[0],strike[1]-grip[1])*scale<=art.manifest.height*.12;
    motion.fx.drawBody(ctx,{key:motion.key,fighterId:art.manifest.id,image:asset.image,
      source:frame.rect,destination:[dx,dy,sw*scale,sh*scale],position:{x:feetX,y:feetY},facing:view.facing,
      airborne:motion.airborne,attackKey:motion.attackKey,opacity:view.opacity??1,
      strikeStart:guardStrike?null:world(native?.strikeStart)??authored(frame.attachments?.strikeStart),
      strike:guardStrike?null:world(native?.strike)??authored(frame.attachments?.strike),
      eligible:motion.eligible&&!view.halfMask&&!(view.eraseProgress>0)&&!view.rotation&&!view.aftermath&&!sourceExclusions.length&&view.clip!=='delete-hammer'});
  }
  ctx.save();
  ctx.globalAlpha = clamp(view.opacity ?? 1, 0, 1);
  ctx.fillStyle = '#0009';
  ctx.beginPath();
  ctx.ellipse(feetX + offset[0] * scale, FLOOR + 5, view.halfMask?32:art.manifest.height > 340 ? 68 : 56, 9, 0, 0, TAU);
  ctx.fill();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const halfCut=dx+(view.cutX??points.torso.x)*scale;
  // A wheel turns the entire native fighter around the measured torso.
  // Body, wear and embedded gear share this one rigid transform.
  if(view.rotation) {
    const pivot=view.rotationPivotPoint??points.torso;
    ctx.translate(dx+pivot.x*scale,dy+pivot.y*scale);ctx.rotate(view.rotation);
    ctx.translate(-dx-pivot.x*scale,-dy-pivot.y*scale);
  }
  if(view.halfMask){ctx.beginPath();ctx.rect(view.halfMask<0?dx-5:halfCut,dy-5,view.halfMask<0?halfCut-dx+5:dx+sw*scale-halfCut+5,sh*scale+10);ctx.clip();}
  if((view.eraseProgress??0)>0) {
    const bounds=frame.opaqueBounds??[0,0,sw,sh];
    const boundary=dy+(bounds[3]-(bounds[3]-bounds[1])*clamp(view.eraseProgress,0,1))*scale;
    ctx.beginPath();ctx.rect(dx-20,dy-20,sw*scale+40,Math.max(0,boundary-dy+20));ctx.clip();
  }
  // One complete source rectangle, one uniform scale, and its own drawn facing.
  if(sourceExclusions.length) {
    ctx.beginPath();ctx.rect(dx,dy,sw*scale,sh*scale);
    for(const [x,y,w,h]of sourceExclusions)ctx.rect(dx+x*scale,dy+y*scale,w*scale,h*scale);
    ctx.clip('evenodd');
  }
  if(view.aftermath?.region) {
    const r=view.aftermath.region;ctx.beginPath();ctx.rect(dx-5,dy-5,sw*scale+10,sh*scale+10);
    ctx.ellipse(dx+r.x*scale,dy+r.y*scale,r.rx*scale,r.ry*scale,0,0,TAU);ctx.clip('evenodd');
  }
  if(view.clip==='delete-hammer'&&!view.rotationPivotPoint) {ctx.beginPath();ctx.rect(-10000,-10000,20000,FLOOR+10001);ctx.clip();}
  ctx.drawImage(asset.image, sx, sy, sw, sh, dx, dy, sw * scale, sh * scale);
  overlays.drawDamage(ctx,asset,frame,view,art,geometry,points,weaponArt);
  if(view.fleshCut){const seam=view.fleshCut,x=dx+seam.x*scale,top=dy+seam.top*scale,bottom=dy+seam.bottom*scale,side=view.halfMask;ctx.fillStyle='#711b1b';ctx.beginPath();ctx.moveTo(x,top);for(let i=0;i<=20;i++){const y=top+(bottom-top)*i/20;ctx.lineTo(x+side*(4+(i%3)*3)*scale,y);}ctx.lineTo(x,bottom);ctx.closePath();ctx.fill();ctx.strokeStyle='#e3a5a0';ctx.lineWidth=Math.max(2,3*scale);ctx.beginPath();ctx.moveTo(x+side*3*scale,top);for(let i=1;i<=20;i++)ctx.lineTo(x+side*(3+(i%4)*2)*scale,top+(bottom-top)*i/20);ctx.stroke();for(let i=0;i<10;i++){ctx.fillStyle=i%2?'#a83632':'#efb0a3';ctx.beginPath();ctx.ellipse(x+side*(5+(i%3)*3)*scale,top+(bottom-top)*(i+.5)/10,(4+i%3)*scale,(6+i%4)*scale,(i%3-.8)*.35,0,TAU);ctx.fill();}}
  for(const embedded of (view.embeddedWeapons??[]).slice(-4)) {
    const placement=weaponAttachment(view,points,embedded),mask=overlays.alphaMask(asset,frame);
    const point=overlays.opaquePoint(mask,placement.point,3)??overlays.opaquePoint(mask,points.chest,0);if(!point)continue;
    const entrySize=clamp(points.bodyLength*scale*.014,3.5,7);
    weaponProp(ctx,weaponArt,embedded.type,dx+point.x*scale,dy+point.y*scale,placement.facing,placement.angle,'insertion');
    nativeOcclusion(ctx,asset,frame,geometry,point,entrySize*.55,entrySize*.72,placement.angle,placement.facing==='left'?-1:1);
    chestEntry(ctx,dx+point.x*scale,dy+point.y*scale,placement.angle,placement.facing,entrySize);
  }
  if(view.weapon&&points.grip&&!(view.weaponAction?.kind==='throw'&&view.weaponAction.released)) {
    const placement=weaponAttachment(view,points);
    weaponProp(ctx,weaponArt,view.weapon.type,dx+placement.point.x*scale,dy+placement.point.y*scale,placement.facing,placement.angle,'grip');
    const radius=clamp((points.gripRadius??points.bodyLength*.024)*scale,4.5,10);
    // Re-draw only the small native palm/finger region over the grip. This is an
    // occlusion of the existing complete frame, never a separate animated limb.
    nativeOcclusion(ctx,asset,frame,geometry,placement.point,radius,radius*.85,placement.angle);
  }
  ctx.restore();
  if(view.aftermath)drawHeadAftermath(ctx,view,art,geometry);
}

function deletionActive(match) {
  return match.phase === 'deletion' || (match.phase === 'over' && match.deletionElapsed > 0);
}

function crt(ctx, match, prop, front) {
  if(!deletionActive(match)||!prop||definitionForMatch(match)?.mechanism!=='crt')return;
  const frontKey=broadcastCutFrontStage(match.deletionElapsed),bank=frontKey?prop.front:prop;
  const key=frontKey??broadcastCutStage(match.deletionElapsed),frame=bank.manifest.frames[key];
  const scale=1.05,t=match.deletionElapsed,anchor=frame.anchor;
  const rise=460*(1-clamp(t/600,0,1));
  const x=match.deletionTargetX-anchor[0]*scale,y=FLOOR-anchor[1]*scale+rise;
  const [sx,sy,sw,sh]=frame.rect;
  ctx.save();
  if(front&&frame.aperture) {
    const [ax,ay,aw,ah]=frame.aperture;
    ctx.beginPath();ctx.rect(-2000,-2000,5000,5000);ctx.rect(x+ax*scale,y+ay*scale,aw*scale,ah*scale);ctx.clip('evenodd');
  }
  ctx.drawImage(bank.image,sx,sy,sw,sh,x,y,sw*scale,sh*scale);
  ctx.restore();
  if(front&&key==='dead') {
    const [wx,wy,ww,wh]=frame.windowInsetRect;
    const centerX=x+(wx+ww/2)*scale,centerY=y+(wy+wh/2)*scale;
    text(ctx,'NO SIGNAL',centerX,centerY,25,'#cec1b0','center','900','monospace');
    text(ctx,'CHANNEL DELETED',centerX,centerY+28,12,'#db705b','center','700','monospace');
  }
}

function definitionForMatch(match) {
  return deletionDefinition(match.fighters?.[match.winner??0]?.id??'6-bit');
}

function machineGeometry(match,prop) {
  const definition=definitionForMatch(match),bank=prop?.additional?.[definition?.id];
  if(!bank||!['coffin','waste-chute','winch','drive'].includes(definition?.mechanism))return null;
  const key=deletionPropState(match.deletionElapsed,match.fighters[match.winner].id),frame=bank.manifest.frames[key];
  const scale=bank.manifest.drawWidth?bank.manifest.drawWidth/bank.manifest.referenceWidth:bank.manifest.drawHeight/bank.manifest.referenceHeight;
  const open=bank.manifest.frames.open;
  const liftHeight=(open.anchor[1]-open.opaqueBounds[1])*scale+8;
  const rise=liftHeight*(1-propBeatProgress(match.deletionElapsed,0,600));
  return {bank,frame,key,definition,scale,x:match.deletionTargetX-frame.anchor[0]*scale,y:FLOOR+(bank.manifest.floorOffset??0)-frame.anchor[1]*scale+rise};
}

function machine(ctx,match,prop,front) {
  if(!deletionActive(match))return;
  const g=machineGeometry(match,prop);if(!g)return;
  const {bank,frame,key,scale,x,y,definition}=g,[sx,sy,w,h]=frame.rect;
  if(front&&definition.mechanism==='winch')return;
  ctx.save();
  // The solid machine rises through a stage slot, rather than becoming visible
  // at full size on the first Deletion frame. The native prop remains opaque.
  if(match.deletionElapsed<600){ctx.beginPath();ctx.rect(-2000,-2000,5000,FLOOR+2001);ctx.clip();}
  if(front&&frame.aperture) {
    const [ax,ay,aw,ah]=frame.aperture;
    ctx.beginPath();ctx.rect(-2000,-2000,5000,5000);ctx.rect(x+ax*scale,y+ay*scale,aw*scale,ah*scale);ctx.clip('evenodd');
  }
  ctx.drawImage(bank.image,sx,sy,w,h,x,y,w*scale,h*scale);
  ctx.restore();
  if(front&&definition.mechanism==='coffin'&&match.deletionElapsed>=definition.beats.lidClose) {
    const times=definition.beats.latchTimes??[],rail=frame.latchRail;
    if(rail)for(let i=0;i<8;i++) {
      const lx=x+(rail[0]+i*rail[2]/7)*scale,ly=y+rail[1]*scale;
      ctx.fillStyle=match.deletionElapsed>=times[i]?'#b8ad96':'#36303a';ctx.fillRect(lx-4,ly-5,8,10);
      if(match.deletionElapsed>=times[i]&&match.deletionElapsed<times[i]+110){ctx.strokeStyle='#d2b99b';ctx.strokeRect(lx-7,ly-8,14,16);}
    }
  }
  if(front&&key==='dead')text(ctx,'DELETED',match.deletionTargetX,FLOOR+30,16,'#d77c73','center','900','monospace');
}

function nativePoseHorizontalEnvelope(art,clips,facing) {
  let min=Infinity,max=-Infinity;
  for(const name of clips) {
    const asset=art.clips[name];if(!asset)continue;
    for(const frame of asset.data.frames[facing]??[]) {
      const bounds=frame.opaqueBounds??[0,0,frame.rect[2],frame.rect[3]],offset=frame.offset??[0,0];
      min=Math.min(min,(bounds[0]+offset[0]-frame.anchor[0])*poseScale(asset,frame));
      max=Math.max(max,(bounds[2]+offset[0]-frame.anchor[0])*poseScale(asset,frame));
    }
  }
  return {min,max};
}

function wandNativeTorsoEnvelope(art,clips,facing) {
  let min=Infinity,max=-Infinity,footDrop=0;
  for(const clip of clips) {
    const asset=art.clips[clip];if(!asset)continue;
    for(let key=0;key<asset.data.frames[facing].length;key++) {
      const frame=asset.data.frames[facing][key],bounds=frame.opaqueBounds;
      const torso=resolvePoseAttachments(frame,clip,key,facing,art.manifest.id).torso,scale=poseScale(asset,frame);
      min=Math.min(min,(bounds[0]-torso.x)*scale);max=Math.max(max,(bounds[2]-torso.x)*scale);
      footDrop=Math.max(footDrop,(bounds[3]-torso.y)*scale);
    }
  }
  return {min,max,footDrop};
}

function machineViews(match,prop,views,art,nativeMask) {
  const registered=registerNewDeletionViews(match,views,art,poseWorldPoint,prop,nativeMask);if(registered)return registered;
  const definition=definitionForMatch(match),bank=prop?.additional?.[definition?.id];
  if(definition?.mechanism==='crt'&&views[1-match.winner]?.deletionFlight) {
    const result=views.map(view=>({...view})),index=1-match.winner,victim=result[index],flight=victim.deletionFlight;
    const capture=hangingVictimPose(art[index].clips,{clip:'delete-brace',elapsed:Math.min(650,definition.beats.drive-definition.beats.shove)});
    const start=poseWorldPoint({...victim,...capture,x:flight.startX,y:flight.startY},art[index],'torso');
    const captured=deletionPose('victim',definition.beats.captured,match.fighters[match.winner].id,match.fighters[index]._clips,match.fighters[index].height);
    const end=poseWorldPoint({...victim,...captured,x:flight.endX,y:flight.endY},art[index],'torso');
    const point=poseWorldPoint(victim,art[index],'torso'),p=flight.progress;
    victim.x+=start.x+(end.x-start.x)*p-point.x;
    victim.y+=start.y+(end.y-start.y)*p-flight.height*Math.sin(p*Math.PI)-point.y;
    return result;
  }
  if(bank&&definition.mechanism==='winch') {
    const result=views.map(view=>({...view})),t=match.deletionElapsed,b=definition.beats;
    // These source keys have different foot-to-torso X registrations. Keep the
    // operator at his station and the restrained chest between the cables.
    // Y stays authored so standing/straightening poses cannot sink below floor.
    if(t>=b.captured) {
      const hero=result[match.winner],heroArt=art[match.winner];
      const station=poseWorldPoint({...hero,clip:'delete-shove',elapsed:10000},heroArt,'torso');
      hero.x+=station.x-poseWorldPoint(hero,heroArt,'torso').x;
    }
    if(t>=b.drive&&t<b.impact) {
      const index=1-match.winner,victim=result[index],g=machineGeometry(match,prop);
      const bounds=g.frame.opaqueBounds,center=g.x+(bounds[0]+bounds[2])/2*g.scale;
      const chest=poseWorldPoint(victim,art[index],'torso');
      // Register the actual restrained chest, rather than a previous brace
      // key: a fox's native anchor can otherwise put him over the left reel.
      victim.x+=(center-chest.x)*easedProgress(t,b.drive,b.captured);
    }
    return result;
  }
  if(bank&&definition.mechanism==='positivity') {
    const result=views.map(view=>({...view})),hero=result[match.winner],victim=result[1-match.winner],o=match._deletionOrigin,b=definition.beats,dir=o.direction;
    const caster=nativePoseHorizontalEnvelope(art[match.winner],['delete-positivity'],hero.facing);
    const target=nativePoseHorizontalEnvelope(art[1-match.winner],['high','delete-brace','low'],victim.facing);
    const gap=dir>0?o.target+target.min-o.near-caster.max:o.near+caster.min-o.target-target.max;
    // Choose one station from the complete source-pose envelopes. Keeping it
    // for the whole spell avoids hopping as a native hand reaches forward.
    hero.x-=dir*Math.max(0,45-gap)*easedProgress(match.deletionElapsed,0,b.castWindup);
    return result;
  }
  if(bank&&definition.mechanism==='truss') {
    const result=views.map(view=>({...view})),t=match.deletionElapsed,b=definition.beats,o=match._deletionOrigin,index=1-match.winner,victim=result[index],victimArt=art[index];
    const capture=hangingVictimPose(victimArt.clips,{clip:'delete-suspended',elapsed:10000}),endpoint={...victim,...capture,x:o.target,y:-o.liftDistance};
    const endHead=poseWorldPoint(endpoint,victimArt,'head');
    if(t>=b.hoist&&t<b.trussHit) {
      const start={...victim,...hangingVictimPose(victimArt.clips,{clip:'delete-suspended',elapsed:0}),x:o.victim,y:0};
      const startHead=poseWorldPoint(start,victimArt,'head'),p=clamp((t-b.hoist)/(b.trussHit-b.hoist),0,1)**2;
      const head=poseWorldPoint(victim,victimArt,'head');
      victim.x+=startHead.x+(endHead.x-startHead.x)*p-head.x;
      victim.y+=startHead.y+(endHead.y-startHead.y)*p-head.y;
    } else if(t>=b.trussHit&&t<b.slamPull) {
      const head=poseWorldPoint(victim,victimArt,'head');
      victim.x+=endHead.x-head.x;victim.y+=endHead.y-head.y;
    } else if(t>=b.slamPull&&t<b.floorSlam) {
      // Transfer the outgoing held head to the first complete falling pose,
      // then release that registration while preserving the authored floor end.
      const first={...victim,...hangingVictimPose(victimArt.clips,{clip:'knockdown',elapsed:0}),x:o.target,y:-o.liftDistance};
      const firstHead=poseWorldPoint(first,victimArt,'head'),p=1-easedProgress(t,b.slamPull,b.floorSlam);
      victim.x+=(endHead.x-firstHead.x)*p;victim.y+=(endHead.y-firstHead.y)*p;
    }
    return result;
  }
  if(bank&&definition.mechanism==='stamp') {
    const result=views.map(view=>({...view})),t=match.deletionElapsed,b=definition.beats,hero=result[match.winner];
    if(art[match.winner].clips['delete-hammer']&&t>=b.stampRaise-120) {
      const heroArt=art[match.winner],ready={...hero,x:match._deletionOrigin.near,clip:'delete-hammer',elapsed:0};
      const pickup={...ready,clip:'pickup',elapsed:heroArt.clips.pickup.timeline.duration-1};
      const delta=poseWorldPoint(pickup,heroArt,'grip').x-poseWorldPoint(ready,heroArt,'grip').x;
      hero.x+=delta*(1-easedProgress(t,b.stampRaise,b.stampStrike));
    }
    if(t>=b.stampRaise) {
      if(art[match.winner].clips['delete-hammer']) {
        const contact={...hero,x:match._deletionOrigin.near,clip:'delete-hammer',elapsed:art[match.winner].clips['delete-hammer'].data.contactMs};
        const body=fallenHeadRegion({...result[1-match.winner],clip:'knockdown',elapsed:10000},art[1-match.winner]).world;
        const fitted=hammerHeadContact(contact,art[match.winner],body);
        if(fitted) {
          const progress=easedProgress(t,b.stampStrike-260,b.stampStrike)*(1-easedProgress(t,b.lift,b.reveal));
          const angle=fitted.angle*progress,c=Math.cos(angle),s=Math.sin(angle);
          const pivotX=contact.x+(fitted.support[0]+fitted.offset[0]-fitted.frame.anchor[0])*fitted.scale;
          const faceX=pivotX+fitted.dx*c-fitted.dy*s;
          hero.x+=(body.x-faceX)*easedProgress(t,b.stampRaise,b.stampStrike);
          if(hero.clip==='delete-hammer') {
            const asset=art[match.winner].clips['delete-hammer'],frame=sourceFrame(asset,hero),index=poseFrameIndex(asset,hero);
            const support=HAMMER_SUPPORT_FEET[hero.facing][index],offset=frame.offset??[0,0];
            hero.rotation=angle;hero.rotationPivotPoint={x:support[0],y:support[1]};
            hero.y+=(frame.anchor[1]-offset[1]-support[1])*poseScale(asset,frame)*progress;
          }
        } else {
          const face=poseWorldPoint(contact,art[match.winner],'hammerFace');
          hero.x+=(body.x-face.x)*easedProgress(t,b.stampRaise,b.stampStrike);
        }
        return result;
      }
      const contact={...hero,x:match._deletionOrigin.near,clip:'delete-stamp',elapsed:art[match.winner].clips['delete-stamp'].data.contactMs};
      const geometry=stampGeometry(match,bank,[...result.slice(0,match.winner),contact,...result.slice(match.winner+1)],art);
      const victim=result[1-match.winner],body=fallenHeadRegion({...victim,clip:'knockdown',elapsed:10000},art[1-match.winner]).world;
      hero.x+=(body.x-geometry.face.x)*easedProgress(t,b.stampRaise,b.stampStrike);
    }
    return result;
  }
  if(bank&&definition.mechanism==='wheel') {
    const result=views.map(view=>({...view})),t=match.deletionElapsed,b=definition.beats,index=1-match.winner,victim=result[index];
    const g=wheelGeometry(match,bank,result,art),point=poseWorldPoint(victim,art[index],'torso');
    if(t>=b.captured&&t<b.launch) {
      const p=easedProgress(t,b.captured,b.captured+250);victim.x+=(g.x-point.x)*p;victim.y+=(g.y-point.y)*p;
    } else if(t>=b.launch&&t<b.landed) {
      const p=clamp((t-b.launch)/(b.landed-b.launch),0,1);victim.x+=(g.x-point.x)*(1-p);victim.y+=(g.y-point.y)*(1-p);
    }
    return result;
  }
  if(bank&&definition.mechanism==='speaker-stack') {
    const result=views.map(view=>({...view})),t=match.deletionElapsed,b=definition.beats;
    const g=speakerGeometry(match,bank,result,art),hero=result[match.winner];
    if(t>=b.landed) {
      const p=easedProgress(t,b.landed,b.stackReach);
      const station=t<b.push?g.grabOperatorX:g.operatorX;
      hero.x+=(station-match._deletionOrigin.operatorX)*p;
      if(t>=b.stackReach&&t<b.topple) {
        const rocking=speakerRockGeometry(match,bank,result,art,g),hand=poseWorldPoint(hero,art[match.winner],'grip');
        hero.x+=rocking.grip.x-hand.x;
      }
    }
    return result;
  }
  if(bank&&definition.mechanism==='wand') {
    const result=views.map(view=>({...view})),t=match.deletionElapsed,b=definition.beats,o=match._deletionOrigin,index=1-match.winner,victim=result[index],victimArt=art[index],hero=result[match.winner],heroArt=art[match.winner],dir=o.direction;
    const takeoffPose=deletionPose('victim',b.lift-.001,match.fighters[match.winner].id,match.fighters[index]._clips,match.fighters[index].height),start=poseWorldPoint({...victim,...takeoffPose,x:o.target,y:0},victimArt,'torso');
    const incoming=poseWorldPoint({...victim,x:o.target,y:0,clip:'high',elapsed:210},victimArt,'torso');
    const capture=hangingVictimPose(victimArt.clips,{clip:'delete-suspended',elapsed:10000}),caster=wandNativeTorsoEnvelope(heroArt,['delete-cast','delete-present'],hero.facing),target=wandNativeTorsoEnvelope(victimArt,['high','delete-brace',capture.clip],victim.facing);
    const ready=poseWorldPoint({...hero,x:o.near,y:0,clip:'delete-cast',elapsed:heroArt.clips['delete-cast'].data.contactMs},heroArt,'torso');
    const gap=dir>0?Math.min(start.x,incoming.x)+target.min-ready.x-caster.max:ready.x+caster.min-Math.max(start.x,incoming.x)-target.max;
    const station=ready.x-dir*Math.max(0,45-gap),near=poseWorldPoint({...hero,x:o.near,y:0},heroArt,'torso');
    // Select one station from all complete cast/presentation and victim keys.
    // Actual torso registration keeps the native foot-anchor changes from
    // crowding the lane or moving the caster after the spell finishes.
    hero.x+=(station-near.x)*easedProgress(t,0,b.castWindup);
    if(t>=b.bind&&t<b.erased) {
      const ceiling=FLOOR-wandNativeTorsoEnvelope(victimArt,[capture.clip],victim.facing).footDrop;
      const takeoff=Math.min(start.y,ceiling);
      const end=poseWorldPoint({...victim,...capture,x:o.target,y:-o.liftDistance},victimArt,'torso');
      const point=poseWorldPoint(victim,victimArt,'torso'),gather=easedProgress(t,b.bind,b.bind+220),lift=easedProgress(t,b.lift,b.lifted);
      victim.x+=incoming.x+(start.x-incoming.x)*gather-point.x;
      // The crouched reaction begins floating before the upright key. Its
      // chest reaches the safe takeoff height while the complete silhouette
      // stays above the floor; no native boot is clipped or deformed.
      if(t>=b.lift-280&&t<b.lift)victim.y+=start.y+(takeoff-start.y)*easedProgress(t,b.lift-280,b.lift)-point.y;
      else if(t>=b.lift)victim.y+=takeoff+(Math.min(end.y,ceiling-o.liftDistance)-takeoff)*lift-point.y;
    }
    return result;
  }
  if(bank&&definition.mechanism==='jaws') {
    const result=views.map(view=>({...view})),t=match.deletionElapsed,b=definition.beats,o=match._deletionOrigin;
    const g=jawsGeometry(match,bank,result,art),hero=result[match.winner],victim=result[1-match.winner];
    if(t>=b.haul) {
      const p=easedProgress(t,b.haul,b.captured),operator=poseWorldPoint(hero,art[match.winner],'torso');
      hero.x+=(g.operatorX-operator.x)*p;
      if(t>=b.close&&t<b.sealed) {
        victim.clip='delete-compressed';
        const clip=art[1-match.winner].clips[victim.clip],change=clip.timeline.entries.find(entry=>entry.index===1)?.start??240;
        victim.elapsed=t<b.squeeze?propBeatProgress(t,b.close,b.squeeze-b.close)*(change-1):change+(clip.timeline.duration-change-1)*propBeatProgress(t,b.squeeze,b.sealed-b.squeeze);
      }
      const head=poseWorldPoint(victim,art[1-match.winner],'head');
      victim.x+=(g.center-head.x)*p;
    }
    return result;
  }
  const g=machineGeometry(match,prop);if(!g)return views;
  const result=views.map(view=>({...view})),victim=1-match.winner,b=g.definition.beats,t=match.deletionElapsed;
  if(g.definition.mechanism==='winch'&&g.frame.aperture&&t>=b.captured) {
    const [ax,ay,aw,ah]=g.frame.aperture;
    result[victim].x=g.x+(ax+aw/2)*g.scale;
    result[victim].y=g.y+(ay+ah)*g.scale-FLOOR;
  }
  const alignBody=(index,centerX,bottomY)=>{
    const view=result[index],asset=art[index].clips[view.clip],frame=sourceFrame(asset,view),offset=frame.offset??[0,0],bounds=frame.opaqueBounds??[0,0,frame.rect[2],frame.rect[3]];
    view.x=centerX-((bounds[0]+bounds[2])/2+offset[0]-frame.anchor[0])*poseScale(asset,frame);
    view.y=bottomY-FLOOR-(bounds[3]+offset[1]-frame.anchor[1])*poseScale(asset,frame);
  };
  if(g.definition.mechanism==='coffin'&&t>=b.entry&&t<b.lidClose&&g.frame.aperture) {
    const [ax,ay,aw,ah]=g.frame.aperture,p=clamp((t-b.entry)/(b.landed-b.entry),0,1),before={...result[victim]};
    alignBody(victim,g.x+(ax+aw/2)*g.scale,g.y+(ay+ah)*g.scale);
    result[victim].x=before.x+(result[victim].x-before.x)*p;result[victim].y=before.y+(result[victim].y-before.y)*p-(before.deletionFlight?before.deletionFlight.height*before.deletionFlight.progress:45)*Math.sin(p*Math.PI);
  }
  if(g.definition.mechanism==='waste-chute'&&t>=b.load&&t<b.lidClose&&g.frame.aperture) {
    const destination=machineGeometry({...match,deletionElapsed:b.captured},prop);
    const [ax,ay,aw,ah]=destination.frame.aperture;
    const centerX=destination.x+(ax+aw/2)*destination.scale,bottomY=destination.y+(ay+ah)*destination.scale-5;
    const captured={...result[victim],clip:'delete-crumpled',elapsed:10000};
    const before={...result[victim]};result[victim]=captured;alignBody(victim,centerX,bottomY);
    const end=poseWorldPoint(result[victim],art[victim],'torso');
    result[victim]=before;
    const flight=before.deletionFlight;
    if(t<b.captured&&flight) {
      const first={...before,...hangingVictimPose(art[victim].clips,{clip:'delete-crumpled',elapsed:b.load-b.folded}),x:flight.startX,y:flight.startY};
      const start=poseWorldPoint(first,art[victim],'torso'),point=poseWorldPoint(before,art[victim],'torso'),p=flight.progress;
      before.x+=start.x+(end.x-start.x)*p-point.x;
      before.y+=start.y+(end.y-start.y)*p-flight.height*Math.sin(p*Math.PI)-point.y;
    } else if(t>=b.captured)alignBody(victim,centerX,bottomY);
  }
  if(g.definition.mechanism==='coffin'&&t>=b.nailApproach&&g.frame.spikeHole) {
    const hero=result[match.winner],holeX=g.x+g.frame.spikeHole[0]*g.scale;
    const body=poseWorldPoint(hero,art[match.winner],'torso');
    const progress=easedProgress(t,b.nailApproach,b.nailRaise);
    // A fixed torso station keeps both boots beside the chest. Individual
    // hands retain their authored motion; they never drag the operator sideways.
    hero.x+=(holeX-193-body.x)*progress;
  }
  if(g.definition.mechanism==='waste-chute'&&t>=b.hopOn&&t<b.present) {
    const hero=result[match.winner],lidY=g.y+(g.frame.lidPoint?.[1]??g.frame.opaqueBounds[1]+12)*g.scale-FLOOR;
    if(t<b.lidTop||t>=b.hopOff) {
      const entering=t<b.lidTop,p=entering?clamp((t-b.hopOn)/(b.lidTop-b.hopOn),0,1):clamp((t-b.hopOff)/(b.present-b.hopOff),0,1);
      const startX=entering?hero.x:match.deletionTargetX,endX=entering?match.deletionTargetX:hero.x;
      hero.x=startX+(endX-startX)*p;hero.y=lidY*(entering?p:1-p)-55*Math.sin(p*Math.PI);
      hero.clip='jump';hero.elapsed=p*(art[match.winner].clips.jump.timeline.duration-.001);
    } else {hero.x=match.deletionTargetX;hero.y=lidY;}
  }
  if(g.definition.mechanism==='drive'&&t>=b.ankleSnare&&t<b.captured) {
    const view=result[victim],bank=art[victim],slot=g.frame.slotPoint??[g.frame.anchor[0],g.frame.opaqueBounds[1]+25];
    const start=poseWorldPoint({...view,clip:'grabbed',elapsed:340,x:match._deletionOrigin.victim,y:0,rotation:0},bank,'torso');
    const end={x:g.x+slot[0]*g.scale,y:g.y+slot[1]*g.scale-28};
    const p=easedProgress(t,b.ankleSnare,b.captured),tilt=easedProgress(t,b.ankleSnare,b.prone);
    view.rotation=view.clip==='delete-rip-front'?0:match._deletionOrigin.direction*1.18*tilt;
    const point=poseWorldPoint(view,bank,'torso');
    view.x+=start.x+(end.x-start.x)*p-point.x;
    view.y+=start.y+(end.y-start.y)*p-125*Math.sin(Math.PI*p)-point.y;
    const asset=bank.clips[view.clip],frame=sourceFrame(asset,view),bounds=frame.opaqueBounds,offset=frame.offset??[0,0],scale=poseScale(asset,frame);
    const torso=poseWorldPoint({...view,rotation:0},bank,'torso'),c=Math.cos(view.rotation),sn=Math.sin(view.rotation);
    const bottom=Math.max(...[bounds[0],bounds[2]].flatMap(x=>[bounds[1],bounds[3]].map(y=>{const wx=view.x+(x+offset[0]-frame.anchor[0])*scale,wy=FLOOR+view.y+(y+offset[1]-frame.anchor[1])*scale;return torso.y+(wx-torso.x)*sn+(wy-torso.y)*c;})));
    view.y-=Math.max(0,bottom-(FLOOR-7*Math.sin(Math.PI*p)));
  }
  return result;
}

function poseWorldPoint(view,art,site='torso') {
  const asset=art.clips[view.clip],frame=sourceFrame(asset,view),offset=frame.offset??[0,0];
  const secondary=frame.attachments?.gripSecondary??frame.attachments?.secondaryGrip??frame.attachments?.supportGrip;
  const points=resolvePoseAttachments(frame,view.clip,poseFrameIndex(asset,view),view.facing,art.manifest.id),raw=site==='gripSecondary'?secondary:frame.attachments?.[site],point=raw?{x:raw[0],y:raw[1]}:points[site]??points.torso;
  const p={x:view.x+(point.x+offset[0]-frame.anchor[0])*poseScale(asset,frame),y:FLOOR+(view.y??0)+(point.y+offset[1]-frame.anchor[1])*poseScale(asset,frame)};
  if(view.rotation) {
    const torso=points.torso,px=view.x+(torso.x+offset[0]-frame.anchor[0])*poseScale(asset,frame),py=FLOOR+(view.y??0)+(torso.y+offset[1]-frame.anchor[1])*poseScale(asset,frame);
    const x=p.x-px,y=p.y-py,c=Math.cos(view.rotation),s=Math.sin(view.rotation);
    return {x:px+x*c-y*s,y:py+x*s+y*c};
  }
  return p;
}

function utilitySprite(ctx,bank,frame,x,y,drawHeight,angle=0,pivot=frame.pivot) {
  if(!frame)return;const [sx,sy,w,h]=frame.rect,scale=drawHeight/(frame.opaqueBounds[3]-frame.opaqueBounds[1]);
  const anchor=pivot??[(frame.opaqueBounds[0]+frame.opaqueBounds[2])/2,(frame.opaqueBounds[1]+frame.opaqueBounds[3])/2];
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.drawImage(bank.images?.[frame.file]??bank.image,sx,sy,w,h,-anchor[0]*scale,-anchor[1]*scale,w*scale,h*scale);ctx.restore();
}

function coverNativeHand(ctx,view,art,site='grip') {
  const asset=art.clips[view.clip],frame=sourceFrame(asset,view),offset=frame.offset??[0,0],scale=poseScale(asset,frame);
  const points=resolvePoseAttachments(frame,view.clip,poseFrameIndex(asset,view),view.facing,art.manifest.id);
  const value=site==='gripSecondary'?(frame.attachments?.gripSecondary??frame.attachments?.secondaryGrip??frame.attachments?.supportGrip):null,point=value?{x:value[0],y:value[1]}:points[site];
  if(!point)return;
  nativeOcclusion(ctx,asset,frame,{dx:view.x+(offset[0]-frame.anchor[0])*scale,dy:FLOOR+(view.y??0)+(offset[1]-frame.anchor[1])*scale,scale},point,9,7);
}

const speakerFitCache=new WeakMap();
function speakerGeometry(match,bank,views,art) {
  const o=match._deletionOrigin,heroArt=art[match.winner],victimArt=art[1-match.winner];
  const previous=speakerFitCache.get(o);
  if(previous?.bank===bank&&previous.heroArt===heroArt&&previous.victimArt===victimArt)return previous.geometry;
  const hero=views[match.winner],victim=views[1-match.winner],dir=o.direction,facing=o.victimFacing??victim.facing;
  const contact={...hero,x:0,y:0,facing:dir>0?'right':'left',clip:'delete-shove',elapsed:heroArt.clips['delete-shove'].data.contactMs??240};
  const hand=poseWorldPoint(contact,heroArt,'grip'),f=bank.manifest.frames.open,dead=bank.manifest.frames.dead;
  const floorView={...victim,x:o.target-(match.fighters[1-match.winner]._clips.knockdown?.endOffsetX?.[facing]??0),y:0,facing,clip:'knockdown',elapsed:10000};
  const asset=victimArt.clips.knockdown,native=sourceFrame(asset,floorView),offset=native.offset??[0,0],bounds=native.opaqueBounds,nativeScale=poseScale(asset,native);
  const bodyLeft=floorView.x+(bounds[0]+offset[0]-native.anchor[0])*nativeScale,bodyRight=floorView.x+(bounds[2]+offset[0]-native.anchor[0])*nativeScale;
  const bodyTop=FLOOR+(bounds[1]+offset[1]-native.anchor[1])*nativeScale;
  // One physical size covers the complete fallen source, with 8px clearance.
  // A small curled victim may require a taller pile than a long, flat one.
  const scale=Math.max(heroArt.manifest.height/(f.opaqueBounds[3]-f.opaqueBounds[1]),
    (bodyRight-bodyLeft+16)/(dead.opaqueBounds[2]-dead.opaqueBounds[0]),
    (FLOOR-bodyTop+8)/(dead.opaqueBounds[3]-dead.opaqueBounds[1]));
  const deadPivot=dead.stagePivot??dead.anchor,deadCenter=(dead.opaqueBounds[0]+dead.opaqueBounds[2])/2;
  const x=(bodyLeft+bodyRight)/2-dir*(deadCenter-deadPivot[0])*scale;
  // The same actual floor corner supports idle, rocking and the whole fall.
  const pivot=[f.opaqueBounds[2],f.opaqueBounds[3]],socketX=f.attachments.pushGrip[0],pushX=x+dir*(socketX-pivot[0])*scale;
  const pushGrip=[socketX,pivot[1]+(hand.y-FLOOR)/scale],grab=poseWorldPoint({...contact,clip:'delete-pull',elapsed:0},heroArt,'grip');
  const contactRoots=[];
  for(const clip of ['delete-pull','delete-shove'])for(let frameIndex=0;frameIndex<heroArt.clips[clip].data.frames[contact.facing].length;frameIndex++) {
    const grip=poseWorldPoint({...contact,clip,frameIndex},heroArt,'grip'),vx=(socketX-pivot[0])*scale;
    for(const angle of [0,.07])contactRoots.push(x+dir*(vx/Math.cos(angle)-(grip.y-FLOOR)*Math.tan(angle))-grip.x);
  }
  const geometry={x,scale,operatorX:pushX-hand.x,grabOperatorX:pushX-grab.x,pivot,pushGrip,contactRoots};
  speakerFitCache.set(o,{bank,heroArt,victimArt,geometry});return geometry;
}
function speakerRockGeometry(match,bank,views,art,g) {
  const t=match.deletionElapsed,b=definitionForMatch(match).beats,hero=views[match.winner],dir=match._deletionOrigin.direction;
  const pivot=g.pivot;
  const angle=.07*propBeatProgress(t,b.stackReach,180)*(1-propBeatProgress(t,b.push-220,220));
  const x=g.x,y=FLOOR;
  const hand=poseWorldPoint(hero,art[match.winner],'grip'),socketX=g.pushGrip[0];
  // Follow the actual native hand along the solid cabinet edge. The complete
  // cabinet rocks on its floor corner; no arm or body part is stretched.
  const vx=(socketX-pivot[0])*g.scale;
  const vy=(hand.y-y-vx*Math.sin(angle))/Math.cos(angle);
  return {x,y,pivot,angle,grip:{x:x+dir*(vx*Math.cos(angle)-vy*Math.sin(angle)),y:hand.y}};
}

function jawsGeometry(match,bank,views,art) {
  const o=match._deletionOrigin,t=match.deletionElapsed,b=definitionForMatch(match).beats,index=1-match.winner;
  const victim=views[index],victimArt=art[index],capture=hangingVictimPose(victimArt.clips,{clip:'delete-brace',elapsed:0});
  const widths=[capture,{clip:'delete-brace',elapsed:0}].map(pose=>{const asset=victimArt.clips[pose.clip],reference=sourceFrame(asset,{...victim,...pose}),bounds=reference.opaqueBounds;return (bounds[2]-bounds[0])*poseScale(asset,reference);});
  const gap=Math.max(...widths)+40;
  const scale=240/(bank.manifest.utilityFrames.jawLeft.opaqueBounds[3]-bank.manifest.utilityFrames.jawLeft.opaqueBounds[1]);
  const small=Math.max(92,gap*.30);let opening=gap;
  if(t>=b.close&&t<b.squeeze)opening=gap+(small-gap)*propBeatProgress(t,b.close,b.squeeze-b.close);
  else if(t>=b.squeeze&&t<b.sealed)opening=small+(18-small)*propBeatProgress(t,b.squeeze,b.sealed-b.squeeze);
  else if(t>=b.sealed&&t<b.reopen)opening=18;
  else if(t>=b.reopen)opening=18+(gap*.8-18)*propBeatProgress(t,b.reopen,b.cube-b.reopen);
  const left=bank.manifest.utilityFrames.jawLeft,right=bank.manifest.utilityFrames.jawRight;
  const half=gap/2+(left.innerFace[0]-left.opaqueBounds[0])*scale,heroArt=art[match.winner],dir=o.direction;
  const contact={...views[match.winner],x:0,y:0,facing:dir>0?'right':'left',clip:'punch',elapsed:heroArt.clips.punch.data.contactMs};
  const hand=poseWorldPoint(contact,heroArt,'grip'),torso=poseWorldPoint(contact,heroArt,'torso'),reach=dir*(hand.x-torso.x);
  let operatorRadius=70;
  for(const id of ['punch','idle']) {
    const asset=heroArt.clips[id];
    for(const facing of ['left','right'])for(let key=0;key<asset.data.frames[facing].length;key++) {
      const f=asset.data.frames[facing][key],points=resolvePoseAttachments(f,id,key,facing,heroArt.manifest.id);
      operatorRadius=Math.max(operatorRadius,Math.abs(f.opaqueBounds[0]-points.torso.x)*poseScale(asset,f),Math.abs(f.opaqueBounds[2]-points.torso.x)*poseScale(asset,f));
    }
  }
  const center=o.target,clearance=Math.max(62,operatorRadius+24-reach),buttonX=center-dir*(half+clearance);
  return {center,scale,opening,fullWidth:half*2,operatorX:buttonX-dir*reach,
    control:{x:buttonX,y:hand.y,pressed:t>=b.close,active:t>=b.close&&t<b.sealed},
    left:{frame:left,x:center-opening/2-(left.innerFace[0]-left.anchor[0])*scale},
    right:{frame:right,x:center+opening/2-(right.innerFace[0]-right.anchor[0])*scale}};
}

function jawsControlPedestal(ctx,match,g) {
  const t=match.deletionElapsed,b=definitionForMatch(match).beats;if(t<b.captured)return;
  const {x,y,pressed,active}=g.control;
  withStagePropLift(ctx,t-b.captured,y-36,()=>{
    ctx.save();
    ctx.fillStyle='#0b1016';ctx.fillRect(x-38,FLOOR-12,76,12);
    const steel=ctx.createLinearGradient(x-25,0,x+25,0);steel.addColorStop(0,'#171c24');steel.addColorStop(.45,'#485460');steel.addColorStop(1,'#111922');
    ctx.fillStyle=steel;ctx.fillRect(x-23,y+20,46,FLOOR-y-30);
    ctx.strokeStyle='#62747d';ctx.lineWidth=2;ctx.strokeRect(x-23,y+20,46,FLOOR-y-30);
    ctx.fillStyle='#141b23';ctx.fillRect(x-37,y-35,74,62);ctx.strokeStyle='#526d79';ctx.strokeRect(x-37,y-35,74,62);
    ctx.fillStyle='#091117';ctx.fillRect(x-30,y-28,60,12);
    text(ctx,active?'RUNNING':pressed?'COMPLETE':'DELETE',x,y-18,9,active?'#6ce6f1':'#a5cbd1','center','900','monospace');
    ctx.fillStyle='#0a0b0e';ctx.beginPath();ctx.ellipse(x,y,23,19,0,0,TAU);ctx.fill();
    ctx.fillStyle=pressed?'#891b24':'#df2d3d';ctx.beginPath();ctx.ellipse(x,y+(pressed?2:0),18,pressed?13:16,0,0,TAU);ctx.fill();
    ctx.strokeStyle=pressed?'#f04449':'#ff8185';ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle=active?'#3de6cf':'#a32938';ctx.fillRect(x-22,y+19,44,3);
    ctx.restore();
  },b.close-b.captured);
}

function nativeHardware(ctx,bank,frame,x,y,scale,dir=1,angle=0,pivot=frame.anchor) {
  const [sx,sy,w,h]=frame.rect;
  ctx.save();ctx.translate(x,y);ctx.scale(dir,1);ctx.rotate(angle);
  if(frame.excludeRects?.length) {
    ctx.beginPath();ctx.rect(-pivot[0]*scale,-pivot[1]*scale,w*scale,h*scale);
    for(const [cx,cy,cw,ch] of frame.excludeRects)ctx.rect((cx-pivot[0])*scale,(cy-pivot[1])*scale,cw*scale,ch*scale);
    ctx.clip('evenodd');
  }
  ctx.drawImage(bank.images?.[frame.file]??bank.image,sx,sy,w,h,-pivot[0]*scale,-pivot[1]*scale,w*scale,h*scale);ctx.restore();
}

// Props move as complete rigid objects. This easing is deliberately separate
// from the body animation: it supplies stage entry and handoff continuity only.
function propBeatProgress(time,start,duration) {
  const p=clamp((time-start)/Math.max(1,duration),0,1);
  return p*p*(3-2*p);
}

function withStagePropLift(ctx,time,top,draw,duration=600) {
  const rise=(FLOOR-top+8)*(1-propBeatProgress(time,0,duration));
  ctx.save();
  if(time<duration){ctx.beginPath();ctx.rect(-2000,-2000,5000,FLOOR+2001);ctx.clip();}
  ctx.translate(0,rise);draw();ctx.restore();
}

function propPointBetween(from,to,progress) {
  return {x:from.x+(to.x-from.x)*progress,y:from.y+(to.y-from.y)*progress};
}

function energyReveal(ctx,progress,draw) {
  if(progress<=0)return;
  ctx.save();ctx.globalAlpha*=progress;draw();ctx.restore();
}

function stampGeometry(match,bank,views,art) {
  const hero=views[match.winner],heroArt=art[match.winner],asset=heroArt.clips['delete-stamp'];
  const contact={...hero,clip:'delete-stamp',elapsed:asset.data.contactMs};
  const a=poseWorldPoint(contact,heroArt,'grip'),c=poseWorldPoint(contact,heroArt,'gripSecondary');
  const reference=bank.manifest.frames.open,scale=Math.hypot(a.x-c.x,a.y-c.y)/Math.hypot(reference.gripRight[0]-reference.gripLeft[0],reference.gripRight[1]-reference.gripLeft[1]);
  const h1=poseWorldPoint(hero,heroArt,'grip'),h2=poseWorldPoint(hero,heroArt,'gripSecondary');
  const left=h1.x<h2.x?h1:h2,right=h1.x<h2.x?h2:h1;
  const frame=bank.manifest.frames[deletionPropState(match.deletionElapsed,'ms-mayhem')];
  const pivot=[(frame.gripLeft[0]+frame.gripRight[0])/2,(frame.gripLeft[1]+frame.gripRight[1])/2];
  const angle=Math.atan2(right.y-left.y,right.x-left.x),x=(h1.x+h2.x)/2,y=(h1.y+h2.y)/2;
  const dx=(frame.strikingFace[0]-pivot[0])*scale,dy=(frame.strikingFace[1]-pivot[1])*scale;
  return {frame,pivot,scale,angle,x,y,face:{x:x+dx*Math.cos(angle)-dy*Math.sin(angle),y:y+dx*Math.sin(angle)+dy*Math.cos(angle)}};
}

function trussGeometry(match,bank,views,art) {
  const o=match._deletionOrigin,victim=views[1-match.winner],native=bank.manifest.frames.open;
  const capture=hangingVictimPose(art[1-match.winner].clips,{clip:'delete-suspended',elapsed:10000}),point=poseWorldPoint({...victim,...capture,x:o.target,y:-o.liftDistance},art[1-match.winner],'head');
  const contact=native.attachments.hitContact,scale=(FLOOR-point.y)/(native.opaqueBounds[3]-contact[1]);
  const x=point.x-(contact[0]-native.anchor[0])*scale,y=FLOOR-(native.opaqueBounds[3]-native.anchor[1])*scale;
  const state=deletionPropState(match.deletionElapsed,'dr3wbaby'),frame=bank.manifest.frames[state];
  const hook=frame.attachments.overheadHook;
  return {bank,frame,scale,x:x-frame.anchor[0]*scale,y:y-frame.anchor[1]*scale,stageX:x,stageY:y,hook:{x:x+(hook[0]-frame.anchor[0])*scale,y:y+(hook[1]-frame.anchor[1])*scale}};
}

function wheelGeometry(match,bank,views,art) {
  const index=1-match.winner,victim=views[index],capture=hangingVictimPose(art[index].clips,{clip:'delete-brace',elapsed:0}),asset=art[index].clips[capture.clip];
  const view={...victim,...capture},native=sourceFrame(asset,view),points=resolvePoseAttachments(native,view.clip,poseFrameIndex(asset,view),view.facing,art[index].manifest.id),torso=points.torso,bounds=native.opaqueBounds;
  const radius=Math.max(...[bounds[0],bounds[2]].flatMap(x=>[bounds[1],bounds[3]].map(y=>Math.hypot(x-torso.x,y-torso.y)*poseScale(asset,native))))+14;
  return {x:match._deletionOrigin.wheelX,y:FLOOR-radius-12,radius,scale:radius*2/bank.manifest.referenceWidth};
}

const extentCache=new WeakMap();
function nativeExtent(art) {
  if(extentCache.has(art))return extentCache.get(art);
  const extent={left:0,right:0,top:0,bottom:0};
  for(const asset of Object.values(art.clips))for(const frames of Object.values(asset.data.frames))for(const f of frames) {
    const [l,t,r,b]=f.opaqueBounds??[0,0,f.rect[2],f.rect[3]],offset=f.offset??[0,0];
    extent.left=Math.min(extent.left,(l+offset[0]-f.anchor[0])*poseScale(asset,f));
    extent.right=Math.max(extent.right,(r+offset[0]-f.anchor[0])*poseScale(asset,f));
    extent.top=Math.min(extent.top,(t+offset[1]-f.anchor[1])*poseScale(asset,f));
    extent.bottom=Math.max(extent.bottom,(b+offset[1]-f.anchor[1])*poseScale(asset,f));
  }
  extentCache.set(art,extent);return extent;
}

function fittedSignatureCamera(match,prop,views,art) {
  const definition=definitionForMatch(match),bank=prop.additional[definition.id],o=match._deletionOrigin;
  const hero=nativeExtent(art[match.winner]),victim=nativeExtent(art[1-match.winner]);
  let heroRoots=[o.winner,o.near],victimRoots=[o.originalVictim,o.victim,o.target],left=Infinity,right=-Infinity,top=FLOOR+hero.top;
  if(definition.mechanism==='speaker-stack') {
    const g=speakerGeometry(match,bank,views,art),f=bank.manifest.frames.open,dead=bank.manifest.frames.dead,deadPivot=dead.stagePivot??dead.anchor;
    heroRoots.push(g.operatorX,g.grabOperatorX,...g.contactRoots);
    const rear=(f.opaqueBounds[0]-g.pivot[0])*g.scale,forward=(g.pivot[1]-f.opaqueBounds[1])*g.scale;
    const pileLeft=(dead.opaqueBounds[0]-deadPivot[0])*g.scale,pileRight=(dead.opaqueBounds[2]-deadPivot[0])*g.scale;
    const extrema=[rear,forward,pileLeft,pileRight].map(distance=>g.x+o.direction*distance);
    left=Math.min(...extrema);right=Math.max(...extrema);
    // The upper rear corner dips lower while rotating than while upright.
    const sweepRadius=Math.hypot(rear,forward);
    top=Math.min(top,FLOOR-sweepRadius,FLOOR-(dead.opaqueBounds[3]-dead.opaqueBounds[1])*g.scale);
    victimRoots.push(o.target-(match.fighters[1-match.winner]._clips.knockdown?.endOffsetX?.[o.victimFacing]??0));
  } else if(definition.mechanism==='sign') {
    const f=bank.manifest.frames.open,s=360/430;
    heroRoots.push(o.operatorX);
    left=o.target+(f.opaqueBounds[0]-f.anchor[0])*s;right=o.target+(f.opaqueBounds[2]-f.anchor[0])*s;
    // Fit the raised sign as well as the landing. A current-pose fit used to
    // zoom toward the falling sign, then abruptly reframe the ending.
    const raised=180+(f.opaqueBounds[1]-f.anchor[1])*s;
    const settled=poseWorldPoint(views[match.winner],art[match.winner],'head').y-45;
    // After the sign has landed, ease toward the surviving operator and debris;
    // the former overhead sign no longer needs to make the ending miniature.
    top=Math.min(top,raised+(settled-raised)*easedProgress(match.deletionElapsed,definition.beats.landed,definition.beats.present));
  } else if(definition.mechanism==='drive') {
    const g=machineGeometry(match,prop),f=g.frame;
    left=g.x+f.opaqueBounds[0]*g.scale;right=g.x+f.opaqueBounds[2]*g.scale;
    top=Math.min(top,180);
  } else if(definition.mechanism==='wand') {
    heroRoots.push(views[match.winner].x);
    top=Math.min(top,FLOOR+victim.top-o.liftDistance-55);
  } else {
    const g=trussGeometry(match,bank,views,art),f=g.frame;
    left=g.x+f.opaqueBounds[0]*g.scale;right=g.x+f.opaqueBounds[2]*g.scale;
    top=Math.min(top,g.y+f.opaqueBounds[1]*g.scale,FLOOR+victim.top-o.liftDistance);
    victimRoots.push(o.slamX);
  }
  left=Math.min(left,...heroRoots.map(x=>x+hero.left),...victimRoots.map(x=>x+victim.left));
  right=Math.max(right,...heroRoots.map(x=>x+hero.right),...victimRoots.map(x=>x+victim.right));
  top=Math.min(top,FLOOR+victim.top);
  const bottom=FLOOR+Math.max(15,hero.bottom,victim.bottom);
  return {zoom:Math.min(.96,1160/(right-left),470/(bottom-top)),x:(left+right)/2,y:(top+bottom)/2};
}

// Each additional finish owns its own hardware and choreography. Shared helpers
// register native prop pieces; they never substitute one finish's mechanism.
function additionalDeletionScene(ctx,match,prop,views,art,front) {
  if(!deletionActive(match))return;
  const definition=definitionForMatch(match),bank=prop?.additional?.[definition?.id];
  if(!bank||['crt','coffin','waste-chute','winch','drive'].includes(definition.mechanism))return;
  const t=match.deletionElapsed,b=definition.beats,origin=match._deletionOrigin,dir=origin.direction;
  const hero=views[match.winner],victim=views[1-match.winner],heroArt=art[match.winner],victimArt=art[1-match.winner];
  const frame=name=>bank.manifest.utilityFrames?.[name]??bank.manifest.frames[name];
  const draw=(name,x,y,height,angle=0,pivot)=>{const f=frame(name);if(f)utilitySprite(ctx,bank,f,x,y,height,angle,pivot??f.pivot);};
  const grip=poseWorldPoint(hero,heroArt,'grip'),chest=poseWorldPoint(victim,victimArt,'torso');
  const snapshot=(clip,elapsed,site='torso',y=0)=>poseWorldPoint({...victim,clip,elapsed,y},victimArt,site);
  if(definition.mechanism==='stamp') {
    if(heroArt.clips['delete-hammer']) {
      // The complete action sprites already contain the hammer and both hands.
      // A floor prop exists only before pickup; the held weapon never duplicates.
      const nativeHold=b.stampRaise-120,pickupDuration=heroArt.clips.pickup.timeline.duration,pickupContact=b.landed+(nativeHold-b.landed)*(heroArt.clips.pickup.data.contactMs??230)/pickupDuration;
      if(t<nativeHold&&(t<pickupContact?!front:front)) {
        const hardware=frame('banHammer'),scale=hardware.drawHeight/(hardware.opaqueBounds[3]-hardware.opaqueBounds[1]);
        const ready={...hero,x:origin.near,clip:'delete-hammer',elapsed:0},hand=poseWorldPoint(ready,heroArt,'grip');
        const floorY=FLOOR-(hardware.opaqueBounds[3]-hardware.grip[1])*scale;
        if(t<pickupContact)nativeHardware(ctx,bank,hardware,hand.x,floorY,scale,1,0,hardware.grip);
        else {const actual=poseWorldPoint(hero,heroArt,'grip');nativeHardware(ctx,bank,hardware,actual.x,actual.y,scale,1,0,hardware.grip);coverNativeHand(ctx,hero,heroArt);}
      }
      if(front&&t>=b.reveal) {
        const hardware=frame('banHammer'),scale=hardware.drawHeight/(hardware.opaqueBounds[3]-hardware.opaqueBounds[1]);
        const last={...hero,clip:'delete-hammer',elapsed:heroArt.clips['delete-hammer'].timeline.duration-1};
        const hand=poseWorldPoint(last,heroArt,'grip'),head=poseWorldPoint(last,heroArt,'hammerFace');
        const startAngle=Math.atan2(head.x-hand.x,-(head.y-hand.y)),p=propBeatProgress(t,b.reveal,400),angle=startAngle+(dir*Math.PI/2-startAngle)*p;
        const [x,y,e,z]=hardware.opaqueBounds,c=Math.cos(angle),s=Math.sin(angle);
        const lowest=Math.max(...[[x,y],[x,z],[e,y],[e,z]].map(([px,py])=>((px-hardware.grip[0])*s+(py-hardware.grip[1])*c)*scale));
        const endY=FLOOR-lowest,endX=hand.x+dir*40;
        nativeHardware(ctx,bank,hardware,hand.x+(endX-hand.x)*p,hand.y+(endY-hand.y)*p,scale,1,angle,hardware.grip);
      }
      return;
    }
    if(!front) {
      // Her native first stamp key already has both hands overhead. Lower the
      // intact stamp into that position ahead of the key, as stage equipment.
      if(t>=b.stampRaise-280&&t<b.stampRaise) {
        const prepared={...hero,x:origin.near,clip:'delete-stamp',elapsed:heroArt.clips['delete-stamp'].data.contactMs};
        const contactViews=views.map((view,index)=>index===match.winner?prepared:view);
        const contact=stampGeometry(match,bank,contactViews,art),floorBody=snapshot('knockdown',10000);
        const raised={...prepared,x:origin.near+floorBody.x-contact.face.x,elapsed:0};
        const g=stampGeometry(match,bank,views.map((view,index)=>index===match.winner?raised:view),art);
        const p=propBeatProgress(t,b.stampRaise-280,280),above=g.y+(g.frame.opaqueBounds[3]-g.pivot[1])*g.scale+160;
        nativeHardware(ctx,bank,g.frame,g.x,g.y-above*(1-p),g.scale,1,g.angle,g.pivot);
      }
      return;
    }
    const release=b.reveal??b.present;
    if(t>=b.stampRaise&&t<release) {
      const g=stampGeometry(match,bank,views,art);
      nativeHardware(ctx,bank,g.frame,g.x,g.y,g.scale,1,g.angle,g.pivot);
      coverNativeHand(ctx,hero,heroArt);coverNativeHand(ctx,hero,heroArt,'gripSecondary');
    }
    if(t>=release) {
      const held={...hero,clip:'delete-stamp',elapsed:heroArt.clips['delete-stamp'].timeline.duration-1};
      const g=stampGeometry(match,bank,views.map((view,index)=>index===match.winner?held:view),art);
      const p=propBeatProgress(t,release,600),endX=g.x-dir*92,endY=FLOOR-(g.frame.opaqueBounds[3]-g.pivot[1])*g.scale;
      const point=propPointBetween(g,{x:endX,y:endY},p);
      nativeHardware(ctx,bank,g.frame,point.x,point.y,g.scale,1,g.angle*(1-p),g.pivot);
    }
    if(t>=b.stampStrike) {
      const mark=frame('verdict'),point=snapshot('knockdown',10000),s=185/(mark.opaqueBounds[2]-mark.opaqueBounds[0]);
      nativeHardware(ctx,bank,mark,point.x,FLOOR+3,s,1,0,mark.floorContact);
    }
    return;
  }
  if(definition.mechanism==='wheel') {
    const g=wheelGeometry(match,bank,views,art),stand=frame('stand'),state=deletionPropState(t,'mr-nice-guy');
    const bow=frame(dir<0?'bowLeft':'bowRight'),bowScale=bow.drawHeight/(bow.opaqueBounds[3]-bow.opaqueBounds[1]);
    const rack={x:origin.operatorX-dir*45,y:FLOOR-(bow.opaqueBounds[3]-bow.grip[1])*bowScale};
    const pickup=b.aim-260,putDown=b.present-300;
    const readyHand=poseWorldPoint({...hero,facing:dir>0?'right':'left',clip:'delete-bow',elapsed:0},heroArt,'grip');
    const drawBow=(point,drawn=false)=>{
      const upper={x:point.x+(bow.upperTip[0]-bow.grip[0])*bowScale,y:point.y+(bow.upperTip[1]-bow.grip[1])*bowScale};
      const lower={x:point.x+(bow.lowerTip[0]-bow.grip[0])*bowScale,y:point.y+(bow.lowerTip[1]-bow.grip[1])*bowScale};
      nativeHardware(ctx,bank,bow,point.x,point.y,bowScale,1,0,bow.grip);
      ctx.save();ctx.strokeStyle='#e2d8bb';ctx.lineWidth=1.7;ctx.beginPath();ctx.moveTo(upper.x,upper.y);
      if(drawn){const string=poseWorldPoint(hero,heroArt,'stringHand');ctx.lineTo(string.x,string.y);}
      ctx.lineTo(lower.x,lower.y);ctx.stroke();ctx.restore();
    };
    if(!front) {
      const s=(FLOOR-g.y)/(stand.opaqueBounds[3]-stand.pivot[1]);
      withStagePropLift(ctx,t,g.y-g.radius,()=>{
        nativeHardware(ctx,bank,stand,g.x,g.y,s,1,0,stand.pivot);
        nativeHardware(ctx,bank,frame(state),g.x,g.y,g.scale,1,t<b.launch?(victim.rotation??0):0,frame(state).wheelCenter);
      });
      if(t<pickup)withStagePropLift(ctx,t,FLOOR-bow.drawHeight,()=>drawBow(rack));
      return;
    }
    if(t>=pickup&&t<b.aim)drawBow(propPointBetween(rack,readyHand,propBeatProgress(t,pickup,b.aim-pickup)));
    if(t>=b.captured&&t<b.launch) {
      const a=victimArt.clips[victim.clip],f=sourceFrame(a,victim),width=(f.opaqueBounds[2]-f.opaqueBounds[0])*a.scale;
      ctx.save();ctx.translate(chest.x,chest.y);ctx.rotate(victim.rotation??0);ctx.strokeStyle='#765235';ctx.lineWidth=7;
      for(const y of [-16,58]){ctx.beginPath();ctx.ellipse(0,y,width*.29,8,0,0,Math.PI);ctx.stroke();}ctx.restore();
    }
    if(t>=b.aim) {
      if(t<putDown) {drawBow(grip,t<b.release);coverNativeHand(ctx,hero,heroArt);}
      else {
        const release=poseWorldPoint({...hero,facing:dir>0?'right':'left',clip:'delete-bow',elapsed:heroArt.clips['delete-bow'].timeline.duration-1},heroArt,'grip');
        drawBow(propPointBetween(release,rack,propBeatProgress(t,putDown,400)));
      }
      const string=poseWorldPoint(hero,heroArt,'stringHand');
      const arrow=frame(dir>0?'arrowRight':'arrowLeft'),as=arrow.drawWidth/(arrow.opaqueBounds[2]-arrow.opaqueBounds[0]);
      const nock=arrow.nock??arrow.grip;
      if(t<b.release)nativeHardware(ctx,bank,arrow,string.x,string.y,as,1,0,nock);
      else if(t<b.arrowHit) {
        const releaseHand=poseWorldPoint({...hero,clip:'delete-bow',elapsed:heroArt.clips['delete-bow'].data.contactMs-1},heroArt,'stringHand');
        const start={x:releaseHand.x+(arrow.tip[0]-nock[0])*as,y:releaseHand.y+(arrow.tip[1]-nock[1])*as};
        const p=clamp((t-b.release)/(b.arrowHit-b.release),0,1);
        nativeHardware(ctx,bank,arrow,start.x+(chest.x-start.x)*p,start.y+(chest.y-start.y)*p,as,1,0,arrow.tip);
      } else {
        const asset=victimArt.clips[victim.clip],native=sourceFrame(asset,victim),points=resolvePoseAttachments(native,victim.clip,poseFrameIndex(asset,victim),victim.facing,victimArt.manifest.id);
        const angle=(points.bodyAngle??0)+(victim.rotation??0),entry=[arrow.tip[0]-dir*75/as,arrow.tip[1]];
        ctx.save();ctx.translate(chest.x,chest.y);ctx.rotate(angle);ctx.beginPath();ctx.rect(dir>0?-300:0,-100,300,200);ctx.clip();
        nativeHardware(ctx,bank,arrow,0,0,as,1,0,entry);ctx.restore();chestEntry(ctx,chest.x,chest.y,angle,victim.facing,11);
      }
    }
    return;
  }
  if(definition.mechanism==='truss') {
    const g=trussGeometry(match,bank,views,art);
    const mic=frame(t>=b.micDrop?'microphone-floor':'microphone'),scale=mic.drawWidth/(mic.opaqueBounds[2]-mic.opaqueBounds[0]);
    if(!front) {
      withStagePropLift(ctx,t,g.y+g.frame.opaqueBounds[1]*g.scale,()=>nativeHardware(ctx,bank,g.frame,g.stageX,g.stageY,g.scale));
      if(t>=b.cableCast-180&&t<b.cableCast) {
        const body=poseWorldPoint(hero,heroArt,'torso'),ready=poseWorldPoint({...hero,clip:'delete-shove',elapsed:0},heroArt,'grip');
        const point=propPointBetween(body,ready,propBeatProgress(t,b.cableCast-180,180));
        nativeHardware(ctx,bank,mic,point.x,point.y,scale,dir,0,mic.grip);
      }
      return;
    }
    if(t>=b.cableCast&&t<b.micDrop) {
      nativeHardware(ctx,bank,mic,grip.x,grip.y,scale,dir,0,mic.grip);coverNativeHand(ctx,hero,heroArt);
      if(t<b.bind) {
        const p=clamp((t-b.cableCast)/(b.bind-b.cableCast),0,1);
        ctx.save();ctx.strokeStyle='#a49aa8';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(grip.x,grip.y);
        ctx.quadraticCurveTo((grip.x+chest.x)/2,chest.y-75,grip.x+(chest.x-grip.x)*p,grip.y+(chest.y-grip.y)*p);ctx.stroke();ctx.restore();
      }
    }
    if(t>=b.micDrop) {
      const release=poseWorldPoint({...hero,clip:'delete-present',elapsed:heroArt.clips['delete-present'].data.contactMs},heroArt,'grip');
      const p=clamp((t-b.micDrop)/440,0,1),drop=frame(p<1?'microphone-drop':'microphone-floor'),s=drop.drawWidth/(drop.opaqueBounds[2]-drop.opaqueBounds[0]);
      const contact=drop.floorContact??[drop.anchor[0],drop.opaqueBounds[3]];
      const endY=FLOOR-(contact[1]-drop.grip[1])*s;
      nativeHardware(ctx,bank,drop,release.x+dir*25*p,release.y+(endY-release.y)*p*p,s,dir,0,drop.grip);
    }
    return;
  }
  if(definition.mechanism==='jaws') {
    const g=jawsGeometry(match,bank,views,art),rail=frame('open');
    if(!front) {
      withStagePropLift(ctx,t,FLOOR-240,()=>{
        // Keep a single native rail beneath two upright sliding assemblies.
        // The rail crop is hardware; the victim stays one complete source key.
        ctx.save();ctx.beginPath();ctx.rect(-2000,FLOOR-23,5000,30);ctx.clip();
        nativeHardware(ctx,bank,rail,g.center,FLOOR,g.fullWidth/bank.manifest.referenceWidth);ctx.restore();
        for(const side of [g.left,g.right])nativeHardware(ctx,bank,side.frame,side.x,FLOOR,g.scale);
      });
      jawsControlPedestal(ctx,match,g);
    } else {
      // Only the inner plate surfaces sit in front of the victim. Housing and
      // screw units stay behind; the center remains readable during eye bulge.
      for(const side of [g.left,g.right]) {
        const f=side.frame,cx=side.x+(f.innerFace[0]-f.anchor[0])*g.scale;
        ctx.save();ctx.beginPath();ctx.rect(side===g.left?cx-50:cx,FLOOR+(55-f.anchor[1])*g.scale,50,225*g.scale);ctx.clip();
        nativeHardware(ctx,bank,f,side.x,FLOOR,g.scale);ctx.restore();
      }
    }
    if(front&&t>=b.reopen) {
      const cube=frame('cube'),p=propBeatProgress(t,b.reopen,b.cube-b.reopen);
      const s=(cube.drawWidth+(112-cube.drawWidth)*(1-p))/(cube.opaqueBounds[2]-cube.opaqueBounds[0]);
      const y=FLOOR-(cube.opaqueBounds[3]-cube.anchor[1])*s;
      nativeHardware(ctx,bank,cube,g.center,y,s,1,0,cube.anchor);
    }
    return;
  }
  if(definition.mechanism==='speaker-stack') {
    const g=speakerGeometry(match,bank,views,art),p=clamp((t-b.topple)/(b.burial-b.topple),0,1);
    if(front===(t>=b.topple)) {
      const f=frame(t>=b.burial?'dead':'open'),pivot=t>=b.burial?(f.stagePivot??f.anchor):g.pivot;
      const y=FLOOR-(f.opaqueBounds[3]-pivot[1])*g.scale;
      const rocking=t>=b.stackReach&&t<b.topple?speakerRockGeometry(match,bank,views,art,g):null;
      withStagePropLift(ctx,t,y+(f.opaqueBounds[1]-pivot[1])*g.scale,()=>{
        if(rocking)nativeHardware(ctx,bank,f,rocking.x,rocking.y,g.scale,dir,rocking.angle,rocking.pivot);
        else nativeHardware(ctx,bank,f,g.x,y,g.scale,dir,t<b.burial?p*p*Math.PI/2:0,pivot);
      });
    }
    return;
  }
  if(definition.mechanism==='sign') {
    const bottom=180+(snapshot('knockdown',0,'head').y-180)*Math.pow(clamp((t-b.signRelease)/(b.signImpact-b.signRelease),0,1),2);
    const fallen=clamp((t-b.signImpact)/(b.landed-b.signImpact),0,1),signY=t<b.signImpact?bottom:bottom+(FLOOR+12-bottom)*fallen;
    if(front===(t>=b.signImpact)) {
      const state=t>=b.signalCut?'dead':t>=b.signImpact?'impact':t>=b.signRelease?'captured':'open',f=frame(state);
      draw(state,match.deletionTargetX,signY,Math.round((f.opaqueBounds[3]-f.opaqueBounds[1])*360/430),0,f.anchor);
    }
    if(!front) {
      const contactView={...hero,x:origin.operatorX,facing:dir>0?'right':'left',clip:'delete-pull',elapsed:heroArt.clips['delete-pull'].data.contactMs};
      const point=poseWorldPoint(contactView,heroArt,'grip'),lever=frame('lever');
      const scale=(FLOOR-point.y)/(lever.anchor[1]-lever.grip[1]);
      withStagePropLift(ctx,t,point.y+(lever.opaqueBounds[1]-lever.grip[1])*scale,()=>draw('lever',point.x,point.y,(lever.opaqueBounds[3]-lever.opaqueBounds[1])*scale,0,lever.grip));
    }
    if(front&&t>=b.noticePin&&t<b.landed)draw('notice',chest.x,chest.y+38,67,dir*.08);
    if(t>=b.present) {
      const source=sourceFrame(heroArt.clips[hero.clip],hero),support=source.attachments?.gripSecondary??source.attachments?.secondaryGrip??source.attachments?.supportGrip;
      const point=support?poseWorldPoint(hero,heroArt,'gripSecondary'):grip;
      const boardName=t<b.closedStamp&&frame('clipboardBlank')?'clipboardBlank':'clipboard',board=frame(boardName);
      const p=propBeatProgress(t,b.present,180),body=poseWorldPoint(hero,heroArt,'torso');
      const boardPoint=propPointBetween(body,point,p),stampPoint=propPointBetween(body,grip,p);
      // Begin behind the intact coat, then clear it into the actual palms.
      if(front===(p>=1)) {
        draw(boardName,boardPoint.x,boardPoint.y,91,-dir*.35,dir<0?board.leftGrip:board.grip);
        draw('stamp',stampPoint.x,stampPoint.y,20,0,frame('stamp').grip);
        if(front){coverNativeHand(ctx,hero,heroArt);coverNativeHand(ctx,hero,heroArt,'gripSecondary');}
      }
    }
    return;
  }
  if(definition.mechanism==='positivity') {
    const casterChest=poseWorldPoint(hero,heroArt,'torso');
    if(t>=b.castWindup) {
      const p=propBeatProgress(t,b.castWindup,220);
      // The native elliptical ring has a far half and a near half. Draw each
      // on its own side of the intact fighter instead of hiding the whole ring.
      ctx.save();ctx.beginPath();
      ctx.rect(-2000,front?casterChest.y:-2000,5000,front?3000:casterChest.y+2000);ctx.clip();
      energyReveal(ctx,p,()=>draw('halo',casterChest.x,casterChest.y,55+45*p,0));ctx.restore();
    }
    if(!front) {
      if(t>=b.peacePulse&&t<b.positivitySurge) {
        const p=propBeatProgress(t,b.peacePulse,240)*(1-propBeatProgress(t,b.positivitySurge-180,180));
        energyReveal(ctx,p,()=>draw('peace',chest.x,chest.y,35+60*p,Math.sin(t*.001)*.08));
      }
      return;
    }
    if(t>=b.peacePulse&&t<b.loveCharge) {
      const p=propBeatProgress(t,b.peacePulse,b.loveCharge-b.peacePulse),reveal=propBeatProgress(t,b.peacePulse,140);
      energyReveal(ctx,reveal,()=>draw('heart',grip.x+(chest.x-grip.x)*p,grip.y+(chest.y-grip.y)*p,38+24*p));
    }
    if(t>=b.loveCharge&&t<b.positivitySurge) {
      const p=(t-b.loveCharge)/(b.positivitySurge-b.loveCharge);
      const overload=propBeatProgress(t,b.loveCharge+(b.positivitySurge-b.loveCharge)*.55-60,120),height=62+95*p+4*Math.sin(t*.015);
      energyReveal(ctx,1-overload,()=>draw('heart',chest.x,chest.y,height));
      energyReveal(ctx,overload,()=>draw('overload',chest.x,chest.y,height));
      for(let i=0;i<8;i++) {
        const a=i*TAU/8+t*.002,r=50+28*p,reveal=propBeatProgress(t,b.loveCharge+i*55,180);
        energyReveal(ctx,reveal,()=>draw(i%2?'petal':'flower',chest.x+Math.cos(a)*r,chest.y+Math.sin(a)*r*.72,18,a));
      }
    }
    if(t>=b.positivitySurge&&t<b.positivitySurge+530) {
      const p=(t-b.positivitySurge)/530,point=snapshot('knockdown',0);
      ctx.save();ctx.globalAlpha=1-p;draw('burst',point.x,point.y,160+140*p);ctx.restore();
    }
    if(t>=b.present) {
      const p=propBeatProgress(t,b.present,240);
      energyReveal(ctx,p,()=>draw('peace',casterChest.x+dir*72,casterChest.y-65,35+35*p,0));
    }
    return;
  }
  if(definition.mechanism==='wand') {
    const wand=frame(hero.facing==='left'?'wandLeft':'wandRight');
    if(!wand)return;
    const scale=(wand.drawWidth??bank.manifest.drawWidth??155)/(wand.opaqueBounds[2]-wand.opaqueBounds[0]),wandHeight=(wand.opaqueBounds[3]-wand.opaqueBounds[1])*scale;
    const asset=heroArt.clips[hero.clip],native=sourceFrame(asset,hero),points=resolvePoseAttachments(native,hero.clip,poseFrameIndex(asset,hero),hero.facing,heroArt.manifest.id);
    const angle=points.gripAngle??0,dx=(wand.tip[0]-wand.grip[0])*scale,dy=(wand.tip[1]-wand.grip[1])*scale;
    const tip={x:grip.x+dx*Math.cos(angle)-dy*Math.sin(angle),y:grip.y+dx*Math.sin(angle)+dy*Math.cos(angle)};
    if(!front) {
      if(t>=b.castWindup-180&&t<b.castWindup) {
        const ready={...hero,clip:'delete-cast',elapsed:0},readyAsset=heroArt.clips[ready.clip],readyNative=sourceFrame(readyAsset,ready);
        const readyPoints=resolvePoseAttachments(readyNative,ready.clip,poseFrameIndex(readyAsset,ready),ready.facing,heroArt.manifest.id);
        const p=propBeatProgress(t,b.castWindup-180,180),body=poseWorldPoint(hero,heroArt,'torso'),hand=poseWorldPoint(ready,heroArt,'grip');
        const point=propPointBetween(body,hand,p),storedAngle=dir*Math.PI/2;
        draw(hero.facing==='left'?'wandLeft':'wandRight',point.x,point.y,wandHeight,storedAngle+((readyPoints.gripAngle??0)-storedAngle)*p,wand.grip);
      }
      if(t>=b.bind&&t<b.erased) {
        const p=propBeatProgress(t,b.bind,220)*(1-propBeatProgress(t,b.erased-180,180));
        energyReveal(ctx,p,()=>draw('rune',chest.x,FLOOR+5,35+40*p,t*.003));
      }
      return;
    }
    if(t>=b.castWindup) {draw(hero.facing==='left'?'wandLeft':'wandRight',grip.x,grip.y,wandHeight,angle,wand.grip);coverNativeHand(ctx,hero,heroArt);}
    if(t>=b.bind&&t<b.erased) {
      const p=propBeatProgress(t,b.bind,220)*(1-propBeatProgress(t,b.erased-180,180)),end=propPointBetween(tip,chest,p);
      ctx.save();ctx.strokeStyle='#248af499';ctx.lineWidth=3;ctx.shadowColor='#247fff';ctx.shadowBlur=9;
      ctx.beginPath();ctx.moveTo(tip.x,tip.y);ctx.quadraticCurveTo((tip.x+end.x)/2,end.y-52*p,end.x,end.y);ctx.stroke();ctx.restore();
      energyReveal(ctx,p,()=>draw('core',tip.x,tip.y,12+15*p));
      if(t<b.dissolve)for(let i=0;i<3;i++) {
        const reveal=propBeatProgress(t,b.bind+i*70,180);
        energyReveal(ctx,reveal,()=>draw('pulse',chest.x+Math.sin(t*.003+i*2.1)*32,chest.y-70+i*65,48,t*.001+i));
      }
    }
    if(t>=b.dissolve&&t<b.erased) {
      const a=victimArt.clips[victim.clip],f=sourceFrame(a,victim),offset=f.offset??[0,0],bounds=f.opaqueBounds,scale=a.scale;
      const x=victim.x+(offset[0]-f.anchor[0]+(bounds[0]+bounds[2])/2)*scale;
      const y=FLOOR+(victim.y??0)+(offset[1]-f.anchor[1]+bounds[3]-(bounds[3]-bounds[1])*victim.eraseProgress)*scale;
      draw('pulse',x,y,67,t*.006);for(let i=0;i<9;i++){const p=((t-b.dissolve+i*91)%650)/650;draw('essence',x+Math.sin(i*2.31+p*4)*44,y-70*p,17+10*(1-p),i+p*3);}
    }
    if(t>=b.erased&&t<b.present)draw('essence',tip.x,tip.y,60,Math.sin(t*.005)*.2);
  }
}

function signatureHardware(ctx,match,prop,views,art,front) {
  if(!deletionActive(match))return;const g=machineGeometry(match,prop);if(!g)return;
  const t=match.deletionElapsed,b=g.definition.beats,hero=views[match.winner],victim=views[1-match.winner],dir=match._deletionOrigin.direction;
  const coverGrip=()=>{
    const bank=art[match.winner],asset=bank.clips[hero.clip],frame=sourceFrame(asset,hero),offset=frame.offset??[0,0],scale=poseScale(asset,frame);
    const points=resolvePoseAttachments(frame,hero.clip,poseFrameIndex(asset,hero),hero.facing,bank.manifest.id);
    const geometry={dx:hero.x+(offset[0]-frame.anchor[0])*scale,dy:FLOOR+(hero.y??0)+(offset[1]-frame.anchor[1])*scale,scale};
    const secondary=frame.attachments?.gripSecondary;
    for(const point of [points.grip,secondary?{x:secondary[0],y:secondary[1]}:null].filter(Boolean))nativeOcclusion(ctx,asset,frame,geometry,point,10,8);
  };
  if(g.definition.mechanism==='coffin'&&front&&t>=b.nailRaise) {
    const frame=g.bank.manifest.utilityFrames?.[t>=b.nailStrike?'nail-bloody':'nail'];if(!frame)return;
    const hole=g.frame.spikeHole??[g.frame.anchor[0],g.frame.opaqueBounds[1]+25],holeX=g.x+hole[0]*g.scale,holeY=g.y+hole[1]*g.scale;
    const held=t<b.nailStrike+160,contactView={...hero,clip:'delete-shove',elapsed:art[match.winner].clips['delete-shove'].data.contactMs??240};
    const torso=poseWorldPoint(contactView,art[match.winner],'torso');contactView.x+=holeX-193-torso.x;
    const contact=poseWorldPoint(contactView,art[match.winner],'grip'),grip=held?poseWorldPoint(hero,art[match.winner],'grip'):contact;
    const driveAngle=-Math.atan2(holeX-contact.x,holeY-contact.y);
    const angle=driveAngle*easedProgress(t,b.nailRaise,b.nailStrike);
    const drawHeight=Math.hypot(holeX-contact.x,holeY-contact.y)*(frame.opaqueBounds[3]-frame.opaqueBounds[1])/Math.hypot(frame.tip[0]-frame.grip[0],frame.tip[1]-frame.grip[1]);
    ctx.save();ctx.globalAlpha*=easedProgress(t,b.nailRaise,b.nailRaise+100);
    if(t>=b.nailStrike){ctx.beginPath();ctx.rect(-2000,-1000,5000,holeY+1000);ctx.clip();}
    utilitySprite(ctx,g.bank,frame,grip.x,grip.y,drawHeight,angle,frame.grip);ctx.restore();
    if(held)coverGrip();
  }
  if(g.definition.mechanism!=='drive')return;
  if(!front&&t>=b.dragStart) {
    const start=match._deletionOrigin.victim,end=match.deletionTargetX,p=clamp((t-b.dragStart)/(b.captured-b.dragStart),0,1);
    ctx.save();ctx.strokeStyle='#77121fd9';ctx.lineCap='round';
    for(let i=0;i<4;i++){ctx.lineWidth=4+i%2*3;ctx.beginPath();ctx.moveTo(start,FLOOR-6+i*3);ctx.lineTo(start+(end-start)*p,FLOOR-8+i*4);ctx.stroke();}ctx.restore();
  }
  if(front&&t>=b.release-200&&t<b.tapeCast) {
    const utilities=g.bank.manifest.utilityFrames??{},frame=utilities['disc'];if(!frame)return;
    const grip=poseWorldPoint(hero,art[match.winner],'grip'),releaseGrip=poseWorldPoint({...hero,clip:'delete-disc-throw',elapsed:art[match.winner].clips['delete-disc-throw'].data.contactMs},art[match.winner],'grip');
    const origin={x:releaseGrip.x+dir*62,y:releaseGrip.y},head=poseWorldPoint(victim,art[1-match.winner],'head'),chest=poseWorldPoint(victim,art[1-match.winner],'torso');
    let x=grip.x,y=grip.y,angle=0;
    if(t>=b.release){
      if(t<b.upperCut){const p=clamp((t-b.release)/(b.upperCut-b.release),0,1);x=origin.x+(head.x-origin.x)*p;y=origin.y+(head.y-origin.y)*p;}
      else if(t<b.bodyCut){const p=clamp((t-b.upperCut)/(b.bodyCut-b.upperCut),0,1);x=head.x+(chest.x-head.x)*p;y=head.y+(chest.y-head.y)*p;}
      else {const p=clamp((t-b.bodyCut)/(b.tapeCast-b.bodyCut),0,1);x=chest.x+dir*320*p;y=chest.y-90*p;}
      angle=(t-b.release)*.022*dir;
      ctx.save();ctx.strokeStyle='#bbc5d266';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x,y,83,26,angle,0,TAU);ctx.stroke();ctx.restore();
    }
    utilitySprite(ctx,g.bank,frame,x,y,155,angle,t<b.release?(dir>0?frame.gripRight:frame.gripLeft):frame.pivot);
    if(t<b.release)coverGrip();
  }
  if(front&&t>=b.tapeCast&&t<b.ankleSnare) {
    const grip=poseWorldPoint(hero,art[match.winner],'grip'),ankle=poseWorldPoint(victim,art[1-match.winner],'torso');
    const cast=clamp((t-b.tapeCast)/(b.ankleSnare-b.tapeCast),0,1),end={x:grip.x+(ankle.x-grip.x)*cast,y:grip.y+(ankle.y-grip.y)*cast};
    ctx.save();ctx.lineCap='butt';
    for(let strand=0;strand<3;strand++){ctx.strokeStyle=strand===1?'#acb4bd':'#414b59';ctx.lineWidth=strand===1?2:5;ctx.beginPath();ctx.moveTo(grip.x,grip.y+strand*4);ctx.quadraticCurveTo((grip.x+end.x)/2,(grip.y+end.y)/2+(t<b.dragStart?22:4),end.x,end.y+strand*3);ctx.stroke();}
    ctx.restore();coverGrip();
  }
}

function cableWraps(ctx,match,prop,views,art,overlays) {
  const definition=definitionForMatch(match),isTruss=definition?.mechanism==='truss',isDrive=definition?.mechanism==='drive',bank=prop?.additional?.[definition?.id];
  const g=isTruss&&bank?{...trussGeometry(match,bank,views,art),definition}:machineGeometry(match,prop);
  if(!g||!['winch','truss','drive'].includes(g.definition.mechanism))return;
  const b=isTruss?{...definition.beats,captured:definition.beats.bind,pressure:definition.beats.hoist,impact:definition.beats.floorSlam}:isDrive?{...definition.beats,captured:definition.beats.ankleSnare,pressure:definition.beats.prone,impact:definition.beats.captured}:g.definition.beats;
  const t=match.deletionElapsed;if(t<b.captured||t>=b.impact)return;
  const index=1-match.winner,view=views[index],asset=art[index].clips[view.clip],frame=sourceFrame(asset,view);
  const points=overlays.attachments(asset,frame,view,art[index].manifest.id),scale=poseScale(asset,frame),offset=frame.offset??[0,0];
  const anatomy=(art[index].manifest.height??points.bodyLength*scale)/scale,angle=points.bodyAngle??0;
  const cos=Math.cos(angle),sin=Math.sin(angle),mask=overlays.alphaMask(asset,frame);
  const caches=cableWraps.cache??={fits:new WeakMap(),layers:new WeakMap()};
  let fits=caches.fits.get(asset);if(!fits){fits=new Map();caches.fits.set(asset,fits);}
  const fitKey=frame.rect.join(',')+':'+view.facing;
  let bands=fits.get(fitKey);
  if(!bands) {
    const opaque=(x,y)=>{
      const ix=Math.round(x),iy=Math.round(y);
      return ix>=0&&iy>=0&&ix<mask.width&&iy<mask.height&&mask.alpha[iy*mask.width+ix]>=160;
    };
    bands=[-.035,.105].map(along=>{
      let x=points.torso.x-sin*anatomy*along,y=points.torso.y+cos*anatomy*along;
      const maximum=Math.ceil(anatomy*.22),minimum=anatomy*.075;
      if(!mask)return{x,y,radius:anatomy*.145};
      // Sample a narrow anatomical strip. Contiguous shirt/coat alpha stops the
      // fit at the actual sides rather than selecting a raised hand or hair.
      if(!opaque(x,y)) {
        let found=false;
        // A bent native torso may move sideways below its chest anchor. Find
        // that waist surface across the same anatomical band before shifting
        // the band up or down; otherwise a slim recoil could lose its second
        // wrap entirely.
        for(let distance=1;distance<=Math.ceil(anatomy*.18)&&!found;distance++)for(const sign of [-1,1]) {
          const nx=x+cos*distance*sign,ny=y+sin*distance*sign;
          if(opaque(nx,ny)){x=nx;y=ny;found=true;break;}
        }
        for(let distance=1;distance<=Math.ceil(anatomy*.035)&&!found;distance++)for(const sign of [-1,1]) {
          const nx=x-sin*distance*sign,ny=y+cos*distance*sign;
          if(opaque(nx,ny)){x=nx;y=ny;found=true;break;}
        }
        if(!found)return null;
      }
      const sides=[-1,1].map(sign=>{
        let edge=0,empty=0;
        for(let distance=1;distance<=maximum;distance++) {
          if(opaque(x+cos*distance*sign,y+sin*distance*sign)){edge=distance;empty=0;}
          else if(++empty>=3)break;
        }
        return edge*sign;
      });
      const center=(sides[0]+sides[1])/2,radius=(sides[1]-sides[0])/2;
      return{x:x+cos*center,y:y+sin*center,radius:clamp(radius,minimum,maximum)};
    }).filter(Boolean);
    fits.set(fitKey,bands);if(fits.size>24)fits.delete(fits.keys().next().value);
  }
  if(!bands.length)return;
  const dx=view.x+(offset[0]-frame.anchor[0])*scale,dy=FLOOR+(view.y??0)+(offset[1]-frame.anchor[1])*scale;
  const tension=clamp((t-b.captured)/(b.pressure-b.captured),0,1);
  const pivot=poseWorldPoint({...view,rotation:0},art[index],'torso'),rotation=view.rotation??0,rotatePoint=p=>({x:pivot.x+(p.x-pivot.x)*Math.cos(rotation)-(p.y-pivot.y)*Math.sin(rotation),y:pivot.y+(p.x-pivot.x)*Math.sin(rotation)+(p.y-pivot.y)*Math.cos(rotation)});
  const loops=bands.map(band=>({...rotatePoint({x:dx+band.x*scale,y:dy+band.y*scale}),
    rx:band.radius*scale+2*(1-tension),ry:clamp(art[index].manifest.height*.023,5,10)*(1-.25*tension)}));
  const thickness=clamp((art[index].manifest.height??320)*.012,3.5,5);
  const wire=(target,path)=>{
    target.beginPath();path(target);target.strokeStyle='#15181e';target.lineWidth=thickness+2;target.stroke();
    target.strokeStyle=isDrive?'#586271':isTruss?'#25212d':'#9d2038';target.lineWidth=thickness;target.stroke();
    target.strokeStyle=isDrive?'#adb8c6':isTruss?'#9d84b7':'#e87e86';target.lineWidth=1;target.stroke();
  };
  const drawTethers=target=>{
    for(let band=0;band<loops.length;band++)for(const side of [-1,1]) {
      const loop=loops[band],bodyX=loop.x+Math.cos(angle+rotation)*loop.rx*side,bodyY=loop.y+Math.sin(angle+rotation)*loop.rx*side;
      const bounds=g.frame.opaqueBounds,width=bounds[2]-bounds[0];
      const outlet=side<0?bounds[0]+width*.33:bounds[2]-width*.33;
      const endX=g.x+outlet*g.scale;
      let endY=g.y+(bounds[1]+(bounds[3]-bounds[1])*(.35+band*.115))*g.scale;
      let cableX=endX;
      if(isDrive){const point=poseWorldPoint(views[match.winner],art[match.winner],band?'gripSecondary':'grip');cableX=point.x;endY=point.y;}
      if(isTruss) {
        const point=side<0?poseWorldPoint(views[match.winner],art[match.winner],band?'gripSecondary':'grip'):g.hook;
        cableX=point.x;endY=point.y;
      }
      wire(target,path=>{path.moveTo(cableX,endY);path.bezierCurveTo(cableX-side*42,endY+26*(1-tension),
        bodyX+side*34,bodyY+13*(1-tension),bodyX,bodyY);});
    }
  };
  const drawArcs=(target,front)=>{
    for(const loop of loops)wire(target,path=>path.ellipse(loop.x,loop.y,loop.rx,loop.ry,angle+rotation,front?0:Math.PI,front?Math.PI:TAU));
  };
  const drawBodyMask=target=>{const [sx,sy,w,h]=frame.rect;target.save();target.translate(pivot.x,pivot.y);target.rotate(rotation);target.translate(-pivot.x,-pivot.y);target.drawImage(asset.image,sx,sy,w,h,dx,dy,w*scale,h*scale);target.restore();};
  const owner=ctx.canvas??ctx;
  let layers=caches.layers.get(owner);
  if(layers===undefined) {
    const rear=nativeCanvas(owner,WIDTH,HEIGHT),front=nativeCanvas(owner,WIDTH,HEIGHT);
    layers=rear&&front?{rear,front,rearCtx:rear.getContext('2d'),frontCtx:front.getContext('2d')}:null;
    if(layers&&(!layers.rearCtx||!layers.frontCtx))layers=null;
    caches.layers.set(owner,layers);
  }
  ctx.save();ctx.globalAlpha=clamp(view.opacity??1,0,1);ctx.lineCap='round';
  if(layers) {
    const rear=layers.rearCtx,front=layers.frontCtx,[sx,sy,w,h]=frame.rect;
    for(const target of [rear,front]) {
      target.globalCompositeOperation='source-over';target.clearRect(0,0,WIDTH,HEIGHT);target.lineCap='round';
    }
    drawTethers(rear);drawArcs(rear,false);
    // Only cable pixels are composited. The one intact native body erases the
    // rear runs and masks the front runs; no limb or garment is redrawn here.
    rear.globalCompositeOperation='destination-out';drawBodyMask(rear);
    if(!isTruss&&g.bank.image) {
      // Spool housings are in front of outgoing cable runs. Remove the native
      // hardware silhouette from this cable-only layer so its visible reels
      // cannot be painted over by the adaptive victim tethers.
      const [px,py,pw,ph]=g.frame.rect;
      rear.drawImage(g.bank.image,px,py,pw,ph,g.x,g.y,pw*g.scale,ph*g.scale);
    }
    rear.globalCompositeOperation='source-over';ctx.drawImage(layers.rear,0,0);
    drawArcs(front,true);
    front.globalCompositeOperation='destination-in';drawBodyMask(front);
    front.globalCompositeOperation='source-over';ctx.drawImage(layers.front,0,0);
  } else {
    // Environments without a scratch surface keep the same fitted front arcs
    // and side entries; no rear arc is superimposed across the victim's body.
    drawTethers(ctx);drawArcs(ctx,true);
  }
  ctx.restore();
}

function interfaceAsset(ctx, art, key, x, y, width, height) {
  const image=art?.images?.[key];if(!image)return false;
  ctx.drawImage(image,x,y,width,height);return true;
}

function healthBar(ctx, fighter, index, portrait, interfaceArt) {
  const right = index === 1;
  const x = right ? 758 : portrait ? 122 : 58;
  const y = 46;
  const width = portrait ? 400 : 464;
  if(portrait){
    const px=right?1166:30;
    ctx.save();ctx.fillStyle='#08090ced';ctx.fillRect(px-3,12,86,86);
    ctx.strokeStyle=right?'#b7f668':'#ba71ee';ctx.lineWidth=2;ctx.strokeRect(px-3,12,86,86);
    if(right){ctx.translate(px+80,0);ctx.scale(-1,1);ctx.drawImage(portrait,0,15,80,80);}
    else ctx.drawImage(portrait,px,15,80,80);
    ctx.restore();
    interfaceAsset(ctx,interfaceArt,right?'portraitP2':'portraitP1',px-3,12,86,86);
  }
  const value = clamp((fighter?.hp ?? fighter?.health ?? 100) / (fighter?.maxHp ?? 100), 0, 1);
  const accent = right ? '#b7f668' : '#ba71ee';
  ctx.fillStyle = '#06070acc';
  ctx.fillRect(x - 6, y - 5, width + 12, 42);
  ctx.strokeStyle = right ? '#438414' : '#602195';
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 6, y - 5, width + 12, 42);
  interfaceAsset(ctx,interfaceArt,right?'railP2':'railP1',x-6,y-5,width+12,42);
  ctx.fillStyle = '#651d29';
  ctx.fillRect(x, y, width, 31);
  if (value > 0) {
    const fill = ctx.createLinearGradient(0, y, 0, y + 31);
    fill.addColorStop(0, value < .25 ? '#fa6750' : right ? '#b7f668' : '#ba71ee');
    fill.addColorStop(.5, value < .25 ? '#b42a36' : right ? '#80b43d' : '#8a42bd');
    fill.addColorStop(1, value < .25 ? '#7d2131' : right ? '#438414' : '#602195');
    ctx.fillStyle = fill;
    ctx.fillRect(right ? x + width * (1 - value) : x, y, width * value, 31);
    ctx.fillStyle = '#f6f0fc30';
    ctx.fillRect(right ? x + width * (1 - value) : x, y + 2, width * value, 2);
  }
  ctx.strokeStyle = '#090b1155';
  ctx.lineWidth = 1;
  for (let i = 1; i < 10; i++) {
    ctx.beginPath();
    ctx.moveTo(x + width * i / 10, y + 2);
    ctx.lineTo(x + width * i / 10, y + 29);
    ctx.stroke();
  }
  text(ctx, fighter?.name ?? (right ? '9 Bit' : '6 Bit'), right ? x + width : x, 32, 25, '#f6f0fc', right ? 'right' : 'left', '900');
  text(ctx, `${Math.ceil(fighter?.hp ?? fighter?.health ?? 100)} / ${fighter?.maxHp ?? 100}`, right ? x : x + width, 98, 11, accent, right ? 'left' : 'right', '700', 'monospace');
  text(ctx, right ? (fighter?.id==='9-bit'?'DARK ENERGY':'PLAYER TWO') : 'PLAYER ONE', right ? x + width : x, 98, 10, '#c9a3e8', right ? 'right' : 'left', '700', 'monospace');
}

function caption(ctx, title, subline, color = '#f6f0fc', size = 62, interfaceArt) {
  if(!interfaceAsset(ctx,interfaceArt,'announcement',230,107,820,154)){
  const fade = ctx.createLinearGradient(0, 90, 0, 247);
  fade.addColorStop(0, '#08090bc4');
  fade.addColorStop(.65, '#08090b9e');
  fade.addColorStop(1, '#08090b00');
  ctx.fillStyle = fade;
  ctx.fillRect(230, 107, 820, 154);
  }
  ctx.save();
  ctx.shadowColor = '#000';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 3;
  text(ctx, title, 640, 188, size, color, 'center', '900', 'Impact, Arial Black, Arial, sans-serif');
  ctx.restore();
  if (subline) text(ctx, subline, 640, 220, 13, '#d6c5e2', 'center', '700', 'monospace');
}

function hud(ctx, match, paused, motionReview = false, portraits = {}, interfaceArt) {
  const announce=(title,subline,color,size)=>caption(ctx,title,subline,color,size,interfaceArt);
  healthBar(ctx, match.fighters?.[0], 0, portraits[match.fighters?.[0]?.id],interfaceArt);
  healthBar(ctx, match.fighters?.[1], 1, portraits[match.fighters?.[1]?.id],interfaceArt);
  if(!interfaceAsset(ctx,interfaceArt,'timer',575,11,130,90)){
  ctx.fillStyle = '#100c16ef';
  ctx.beginPath();
  ctx.moveTo(588, 13);
  ctx.lineTo(692, 13);
  ctx.lineTo(705, 76);
  ctx.lineTo(640, 99);
  ctx.lineTo(575, 76);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#c9a3e8';
  ctx.lineWidth = 2;
  ctx.stroke();
  }
  text(ctx, match.mode==='weapons'||match._roundTimeLimit===0?'∞':Math.max(0, Math.ceil((match.roundRemaining ?? 99000) / 1000)).toString().padStart(2, '0'), 640, 65, 42, '#f6f0fc', 'center', '900', 'Impact, Arial Black, Arial, sans-serif');
  text(ctx, 'SYSTEM CLASH', 640, 113, 9, '#c9a3e8', 'center', '700', 'monospace');

  if (paused) announce( 'PAUSED', 'PRESS P TO RETURN TO THE FIGHT', '#f6f0fc', 55);
  else if (match.phase === 'ready') announce( 'START FIGHT', `${match.fighters?.[0]?.name?.toUpperCase()} VS. ${match.fighters?.[1]?.name?.toUpperCase()} / THE SIGNAL IS YOURS`, '#f6f0fc', 62);
  else if (match.phase === 'countdown') announce( match.status || 'ROUND 1', 'GET READY', '#b7f668', 70);
  else if (match.phase === 'finish') {
    const winner = match.fighters?.[match.winner ?? 0];
    const finish=definitionForMatch(match)?.name.toUpperCase()??'DELETION';
    const hint = match.finisherAvailable ? (match.winner===1&&match.mode==='cpu'?'CPU / '+finish:winner.name.toUpperCase()+' / PRESS '+(match.winner===1?'ENTER':'F')+' FOR '+finish) : `${winner?.name?.toUpperCase()} WINS / SIGNAL EXPIRING`;
    announce( match.finisherAvailable ? 'DELETE HIM!' : 'K.O.', `${hint} Â· ${Math.ceil((match.finishRemaining ?? 6000) / 1000)}s`, '#ef5750', 70);
  } else if (match.phase === 'deletion') {
    text(ctx, match.deletionName?.toUpperCase() ?? 'BROADCAST CUT', 640, 679, 32, '#c9a3e8', 'center', '900', 'Impact, Arial Black, Arial, sans-serif');
    text(ctx, 'FINAL TRANSMISSION', 640, 702, 10, '#d6c5e2', 'center', '700', 'monospace');
  } else if (match.phase === 'poses') {
    text(ctx, match.poseLabel ?? 'SHARED DELETION POSES', 640, 185, 32, '#c9a3e8', 'center', '900', 'Impact, Arial Black, Arial, sans-serif');
    text(ctx, motionReview?'WHOLE-BODY MOVE / NATIVE FRAME '+(match.poseKey??1):'WHOLE-BODY KEY '+(match.poseKey ?? 1)+' / REUSABLE FINISHER MOTION', 640, 209, 11, '#d6c5e2', 'center', '700', 'monospace');
  } else if (match.phase === 'over') {
    const winner = match.winner == null ? 'DRAW' : `${match.fighters?.[match.winner]?.name?.toUpperCase() ?? 'FIGHTER'} WINS`;
    const title = deletionActive(match) ? 'DELETION' : String(match.status ?? '').startsWith('TIME UP') ? 'TIME UP' : 'K.O.';
    if(deletionActive(match)) {
      text(ctx,title,640,679,36,'#ee5d4c','center','900','Impact, Arial Black, Arial, sans-serif');
      text(ctx,`${winner} / PRESS R TO RESTART`,640,702,10,'#d6c5e2','center','700','monospace');
    } else announce( title, `${winner} / PRESS R TO RESTART`, '#f6f0fc', 66);
  }
  const marked=interfaceAsset(ctx,interfaceArt,'barcodeMark',28,683,44,18);
  text(ctx, 'BARCODE / TRANSMISSION FLOOR', marked?82:28, 697, 10, '#c9a3e8', 'left', '700', 'monospace');
  text(ctx, match.phase === 'fight' ? 'SIGNAL LIVE' : match.phase === 'over' ? 'SIGNAL ENDED' : 'CH 06 / 09', 1252, 697, 10, '#c9a3e8', 'right', '700', 'monospace');
  if(!['poses','deletion'].includes(match.phase))for(let i=0;i<2;i++) {
    const weapon=match.fighters?.[i]?.weapon;if(!weapon)continue;
    const x=i?966:60,color=i?'#b7f668':'#ba71ee';
    if(!interfaceAsset(ctx,interfaceArt,i===1?'weaponP2':'weaponP1',x-10,650,260,31)){ctx.fillStyle='#08090ccf';ctx.fillRect(x-10,650,260,31);}
    text(ctx,weapon.name??(weapon.type==='pulse-driver'?'PULSE DRIVER':'NEURAL SPIKE'),x,667,11,color,'left','700','monospace');
    for(let charge=0;charge<3;charge++){ctx.fillStyle=charge<weapon.charges?color:'#41424a';ctx.fillRect(x+183+charge*15,658,10,10);}
    if(!weapon.charges)text(ctx,'EMPTY Â· DOWN + THROW',x,678,8,'#b2a1a3','left','700','monospace');
  }
}

function screenTexture(ctx) {
  ctx.fillStyle='#06070916';
  for(let y=0;y<HEIGHT;y+=4)ctx.fillRect(0,y,WIDTH,1);
  const vignette=ctx.createRadialGradient(640,370,235,640,370,770);
  vignette.addColorStop(0,'#03040700');vignette.addColorStop(1,'#0304077a');
  ctx.fillStyle=vignette;ctx.fillRect(0,0,WIDTH,HEIGHT);
}

function createStaticLayers(owner) {
  // Exactly two bounded surfaces. Stage overscan matches its authored extents,
  // including the wide Deletion camera; live bodies, HUD and effects stay live.
  let arena=nativeCanvas(owner,WIDTH+800,HEIGHT+600),arenaContext=arena?.getContext('2d');
  if(arenaContext){arenaContext.translate(400,400);stage(arenaContext);}
  const texture=nativeCanvas(owner,WIDTH,HEIGHT),textureContext=texture?.getContext('2d');
  if(textureContext)screenTexture(textureContext);
  return {
    releaseArena(){if(arena){arena.width=1;arena.height=1;}arena=null;arenaContext=null;},
    drawStage(ctx){if(arenaContext)ctx.drawImage(arena,-400,-400);else stage(ctx);},
    drawTexture(ctx){if(textureContext)ctx.drawImage(texture,0,0);else screenTexture(ctx);},
  };
}

/** Draws intact fighter crops and code-native stage effects. No image pixels are edited. */
export function createFightRenderer(canvas) {
  if (!canvas?.getContext) throw new Error('A fight canvas is required.');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser could not open the fight screen.');
  const overlays=createPoseOverlays(canvas),layers=createStaticLayers(canvas),stageRenderer=createStageRenderer(canvas),motionFX=createFightMotionFX();
  let worldCamera=createFightCamera(),lastWorldClock=null,lastStageId=null;
  let interfaceArt=null;
  layers.drawStage(ctx);
  caption(ctx, 'CONNECTINGâ€¦', 'LOADING 6 BIT / 9 BIT', '#c0aa93', 48);
  return {
    prepareInterface(art) { interfaceArt=art?.images?art:null; },
    prepareArt(art) {
      // Both exact contact-hand anchors are prepared before engine spawn metadata.
      for(const entry of art??[]) {
        const asset=entry.clips?.punch;if(!asset)continue;
        for(const facing of ['right','left']) {
          const view={clip:'punch',elapsed:asset.data.contactMs??170,facing};
          const frame=sourceFrame(asset,view);if(frame)overlays.attachments(asset,frame,view,entry.manifest.id);
        }
      }
    },
    draw(scene = {}) {
      const match = scene.match ?? { phase: 'ready', fighters: [] };
      const effects = scene.effects;
      let views = scene.views ?? [];
      const art = scene.art ?? [];
      const camera = effects?.camera ?? { x: 0, y: 0 };
      const definition=deletionActive(match)?definitionForMatch(match):null;
      motionFX.beginFrame({timeMs:scene.presentationTimeMs??globalThis.performance?.now(),
        resetKey:scene.motionResetKey??match,paused:scene.paused??match.paused??false,reducedMotion:scene.reducedMotion,
        review:scene.motionReview||scene.deletionReview||match.motionReview||match.phase==='poses',
        peaceful:definition?.peaceful||definition?.mechanism==='hug'});
      const drawActor=(index,eligible=true)=>{
        const f=match.fighters?.[index],view=views[index],action=f?.action;
        const attack=['punch','kick','low-punch','low-kick','uppercut','jump-punch','jump-kick','crouch-punch','crouch-kick','crouch-high-kick','double-punch','power-kick'].includes(action);
        const attackKey=attack&&match.phase==='fight'?action+':'+Math.round((match.combatTime??0)-(f.actionTime??0)):null;
        fighter(ctx,view,art[index],overlays,scene.weaponArt,false,{fx:motionFX,key:index,eligible,
          native:f?._clips?.[view?.clip]?.combatPoses,attackKey,
          airborne:Boolean(view?.airborne||(action==='thrown'&&f?._launched&&(view?.y??0)<0))});
      };
      if(deletionActive(match)){views=deletionAftermathViews(match,views,art);views=machineViews(match,scene.deletionProp,views,art,overlays.alphaMask);}
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle='#10151d';ctx.fillRect(0,0,WIDTH,HEIGHT);
      ctx.save();
      ctx.translate(camera.x ?? 0, camera.y ?? 0);
      const cinematic=deletionActive(match)&&(!scene.reducedMotion||['wheel','speaker-stack','truss','sign','drive','wand'].includes(definitionForMatch(match)?.mechanism));
      let framing=null;
      if(cinematic) {
        const phase=match.deletionElapsed,definition=definitionForMatch(match),b=definition.beats;
        const wheel=definition.mechanism==='wheel'?wheelGeometry(match,scene.deletionProp.additional[definition.id],views,art):null;
        const fitted=['speaker-stack','truss','sign','drive','wand'].includes(definition.mechanism)?fittedSignatureCamera(match,scene.deletionProp,views,art):null;
        framing=deletionCamera({time:phase,mechanism:definition.mechanism,beats:b,targetX:match.deletionTargetX,direction:match._deletionOrigin.direction,fitted,wheel,reducedMotion:scene.reducedMotion});
        ctx.translate(640,380);ctx.scale(framing.zoom,framing.zoom);ctx.translate(-framing.x,-framing.y);
      }
      const wideWorld=match.stage&&match.stage.cinematicOrigin===null;
      if(wideWorld) {
        const dt=lastWorldClock===null?0:Math.max(0,match.stage.clock-lastWorldClock);
        if(lastStageId!==match.stage.id||(lastWorldClock!==null&&match.stage.clock<lastWorldClock)){worldCamera=createFightCamera({worldWidth:match.stage.width});worldCamera.x=clamp((match.fighters[0]?.x+match.fighters[1]?.x)/2||match.stage.width/2,640,match.stage.width-640);}
        advanceFightCamera(worldCamera,{fighters:views.length?views:match.fighters,worldWidth:match.stage.width,dtMs:dt,reducedMotion:scene.reducedMotion,focusIndex:scene.cameraFocusIndex??0});
        ctx.translate(640,FLOOR);ctx.scale(worldCamera.zoom,worldCamera.zoom);ctx.translate(-worldCamera.x,-FLOOR);
      }
      if(match.stage) {
        layers.releaseArena();lastWorldClock=match.stage.clock;lastStageId=match.stage.id;
        ctx.save();ctx.translate(-(match.stage.cinematicOrigin??0),0);
        stageRenderer.drawBackground(ctx,match.stage,scene.stageArt);
        stageRenderer.drawBehind(ctx,match.stage,scene.stageArt,{reducedMotion:scene.reducedMotion,cameraX:worldCamera.x,fighting:match.phase==='fight',cinematicElapsed:match.phase==='deletion'||match.phase==='over'&&match.deletionElapsed>0?match.deletionElapsed:null});
        ctx.restore();
      } else {layers.drawStage(ctx);lastWorldClock=null;lastStageId=null;}
      effects?.drawBehind?.(ctx, match);
      floorWeapons(ctx,match,scene.weaponArt);
      projectiles(ctx,match,scene.weaponArt,false);
      crt(ctx,match,scene.deletionProp,false);
      machine(ctx,match,scene.deletionProp,false);
      const victim=match.winner==null?1:1-match.winner;
      if(deletionActive(match)) {
        signatureHardware(ctx,match,scene.deletionProp,views,art,false);
        additionalDeletionScene(ctx,match,scene.deletionProp,views,art,false);
        drawNewDeletionScene(ctx,match,scene.deletionProp,views,art,false,{reducedMotion:scene.reducedMotion});
        const mouth=machineGeometry(match,scene.deletionProp);
        const foldedInside=mouth?.definition.mechanism==='waste-chute'&&match.deletionElapsed>=mouth.definition.beats.captured&&mouth.frame.aperture;
        if(foldedInside) {
          const [ax,ay,aw,ah]=mouth.frame.aperture;
          ctx.save();ctx.beginPath();ctx.rect(mouth.x+ax*mouth.scale,mouth.y+ay*mouth.scale,aw*mouth.scale,ah*mouth.scale);ctx.clip();
        }
        const oakBehind=definitionForMatch(match).mechanism==='rip'&&match.deletionElapsed<definitionForMatch(match).beats.rip;
        if(oakBehind)drawActor(match.winner,!foldedInside);
        const litter=definitionForMatch(match).mechanism==='litter-box'&&views[victim]?.litterCaptured?litterBoxGeometry(match,scene.deletionProp,art):null;
        if(litter){ctx.save();ctx.beginPath();ctx.rect(litter.left,0,litter.right-litter.left,litter.bottom);ctx.clip();}
        drawActor(victim,!foldedInside&&!litter);
        if(litter)ctx.restore();
        if(foldedInside)ctx.restore();
        if(definitionForMatch(match).mechanism==='crt') {
          if(broadcastCutDepth(match.deletionElapsed)==='inside')crt(ctx,match,scene.deletionProp,true);
        } else {
          const definition=definitionForMatch(match),frontAt=definition.mechanism==='waste-chute'?definition.beats.captured:definition.mechanism==='drive'?definition.beats.dragStart:definition.beats.captured;
          if(match.deletionElapsed>=frontAt)machine(ctx,match,scene.deletionProp,true);
        }
        cableWraps(ctx,match,scene.deletionProp,views,art,overlays);
        const litterOnly=definitionForMatch(match).mechanism==='litter-box';
        if(litterOnly)drawNewDeletionScene(ctx,match,scene.deletionProp,views,art,true,{reducedMotion:scene.reducedMotion});
        if(!oakBehind)drawActor(match.winner);
        if(definitionForMatch(match).mechanism==='coffin'&&match.deletionElapsed>=definitionForMatch(match).beats.nailApproach)machine(ctx,match,scene.deletionProp,true);
        signatureHardware(ctx,match,scene.deletionProp,views,art,true);
        additionalDeletionScene(ctx,match,scene.deletionProp,views,art,true);
        if(!litterOnly)drawNewDeletionScene(ctx,match,scene.deletionProp,views,art,true,{reducedMotion:scene.reducedMotion});
      } else for(let i=0;i<views.length;i++)drawActor(i);
      projectiles(ctx,match,scene.weaponArt,true);
      effects?.drawFront?.(ctx, match);
      if(match.stage&&wideWorld)stageRenderer.drawFront(ctx,match,scene.stageArt,{reducedMotion:scene.reducedMotion});
      ctx.restore();
      ctx.setTransform(1,0,0,1,0,0);
      if ((effects?.flash ?? 0) > 0) {
        ctx.fillStyle = `rgba(199,69,46,${clamp(effects.flash, 0, .18)})`;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
      }
      layers.drawTexture(ctx);
      hud(ctx, match, scene.paused ?? match.paused ?? false,scene.motionReview??false,scene.portraits??{},interfaceArt);
      if(wideWorld&&match.phase==='fight')for(const [index,f]of (match.fighters??[]).entries()) {
        const x=640+(views[index]?.x??f.x)-worldCamera.x;if(!(f.hp>0)||!Number.isFinite(x)||x>=0&&x<=WIDTH)continue;
        const right=x>WIDTH,name=String(f.name??f.id??'FIGHTER').toUpperCase().slice(0,16);
        const width=Math.max(110,name.length*9+44),left=right?WIDTH-width-12:12;
        ctx.save();ctx.fillStyle='#0a131be8';ctx.fillRect(left,FLOOR-176,width,32);
        text(ctx,name,right?WIDTH-42:42,FLOOR-153,16,'#f0d6b5',right?'right':'left', '700','monospace');
        const tip=right?WIDTH-20:20,base=right?WIDTH-30:30,y=FLOOR-161;
        ctx.fillStyle='#f0d6b5';ctx.beginPath();ctx.moveTo(tip,y);ctx.lineTo(base,y-7);ctx.lineTo(base,y+7);ctx.closePath();ctx.fill();ctx.restore();
      }
      if(deletionActive(match)){const definition=definitionForMatch(match);if(definition.mechanism==='hug'&&match.deletionElapsed>=definition.beats.present){ctx.save();ctx.fillStyle='#080e16d9';ctx.fillRect(365,139,550,38);ctx.font='700 22px Arial, sans-serif';ctx.textAlign='center';ctx.fillStyle='#f0d6b5';ctx.fillText(definition.line,640,166);ctx.restore();}}
    },
    resolveEvent(event,{match,views,art,deletionProp}) {
      event={...event,victimId:match.fighters[event.target]?.id};
      if(!event.contact||!deletionActive(match))return event;
      const snapshot={...match,deletionElapsed:event.at??match.deletionElapsed,phase:'deletion'};
      const native=views.map((view,index)=>({...view,...(index===event.target?event.contactView:index===event.attacker?event.sourceView:null)}));
      const aligned=machineViews(snapshot,deletionProp,native,art,overlays.alphaMask),g=machineGeometry(snapshot,deletionProp);
      let point=poseWorldPoint(aligned[event.contact.fighterIndex],art[event.contact.fighterIndex],event.contact.site);
      const location=event.cue==='nail-strike'?g?.frame.spikeHole:event.cue==='chute-stamp'?g?.frame.lidPoint:event.cue==='drive-blade-cut'?g?.frame.slotPoint:null;
      if(location)point={x:g.x+location[0]*g.scale,y:g.y+location[1]*g.scale};
      if(event.cue==='ban-stamp') {
        point=fallenHeadRegion(aligned[event.target],art[event.target]).world;
        event={...event,site:'head',injuryRegion:'head',aftermath:'head-crush'};
      }
      if(['sign-strike','speaker-burial','crt-crush','chrome-seal','cable-snap','chute-stamp','drive-blade-cut'].includes(event.cue))event={...event,aftermath:'body-rupture',aftermathWidth:({ 'sign-strike':360,'chrome-seal':290,'speaker-burial':390,'crt-crush':430,'cable-snap':300,'chute-stamp':260,'drive-blade-cut':300 })[event.cue]};
      return {...event,x:point.x+(event.contact.offset?.[0]??0),y:point.y+(event.contact.offset?.[1]??0)};
    },
    resize() {
      // The logical stage stays fixed; CSS fits it to the available screen.
      return { width: WIDTH, height: HEIGHT };
    }
  };
}
