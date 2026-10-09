import {poseScale,compileWeaponOrigins,resolvePoseAttachments,poseFrameIndex,weaponAttachment} from './fight-attachments.mjs';
import {nativeHurtRegions,nativePushRegions} from './fight-combat-geometry.mjs';
import {deletionDefinition} from './deletion-library.mjs';
import {stageById} from './fight-stages.mjs';
const ACTIONS = ['idle','walk','crouch','block','punch','kick','high','low','grabbed','thrown','knockdown','getup'];

export function assetPath(manifestPath, file) {
  const url = new URL(file, new URL(manifestPath, 'https://system-clash.invalid/'));
  if (url.origin !== 'https://system-clash.invalid') throw new Error('Animation must use a local reference.');
  return decodeURIComponent(url.pathname.slice(1));
}

// Hosted matches prefer verified lossless copies. Portable bundles keep their
// existing original-image keys unless they explicitly include the served copy.
function fightImagePath(manifestPath,data,bundle) {
  const original=assetPath(manifestPath,data.file);
  if(!data.runtimeFile)return original;
  const runtime=assetPath(manifestPath,data.runtimeFile);
  return !bundle||bundle.images?.[runtime]?runtime:original;
}

export function compileFightClip(data, image, manifest, name) {
  if (!data?.file) throw new Error(`${manifest.character}: ${name} is missing.`);
  const order = data.order ?? [0,1,2,3];
  let cursor = 0;
  const entries = order.map((index, position) => {
    const timing = Array.isArray(data.frameMs) ? data.frameMs[data.frameMs.length === order.length ? position : index] : data.frameMs;
    const duration = timing ?? 120;
    if (!Number.isInteger(index) || !Number.isFinite(duration) || duration <= 0) throw new Error(`${name}: invalid animation timing.`);
    const start = cursor;
    cursor += duration;
    return {index, start, end:cursor};
  });
  if (!entries.length) throw new Error(`${name}: no poses.`);
  for (const facing of ['left','right']) {
    const frames = data.frames?.[facing];
    if (!frames?.length) throw new Error(`${name}: missing ${facing} poses.`);
    for (const {index} of entries) {
      const frame = frames[index], rect = frame?.rect, anchor = frame?.anchor;
      if (!Array.isArray(rect) || rect.length !== 4 || !rect.every(Number.isFinite) || rect[0] < 0 || rect[1] < 0 || rect[2] <= 0 || rect[3] <= 0 || rect[0]+rect[2] > image.width+1 || rect[1]+rect[3] > image.height+1) throw new Error(`${name}: source pose is outside its image.`);
      if (!Array.isArray(anchor) || anchor.length !== 2 || !anchor.every(Number.isFinite)) throw new Error(`${name}: missing floor anchor.`);
      if (frame.bodyCalibration !== undefined && (!Number.isFinite(frame.bodyCalibration) || frame.bodyCalibration < .75 || frame.bodyCalibration > 1.4)) throw new Error(`${name}: invalid native body calibration.`);
      if (frame.offset !== undefined && (!Array.isArray(frame.offset) || frame.offset.length !== 2 || !frame.offset.every(Number.isFinite))) throw new Error(`${name}: invalid whole-pose offset.`);
    }
  }
  const frameScales = Object.values(data.frames).flat().map(frame=>frame.scale).filter(scale=>scale !== undefined);
  if (frameScales.some(scale=>scale !== frameScales[0])) throw new Error(`${name}: poses cannot change scale.`);
  const scale = data.scale ?? manifest.scale ?? frameScales[0] ?? manifest.height/data.frames.right[0].rect[3];
  if (!Number.isFinite(scale) || scale <= 0) throw new Error(`${name}: invalid sheet scale.`);
  return {data, image, scale, timeline:{entries,duration:cursor}};
}

// Compile once at load: combat uses a few pose-local shapes, never image pixels.
// Native floor anchors, offsets and independent facings are shared with drawing.
function compileCombatPoses(asset,name,fighter) {
  const height=fighter.manifest.height,hand=name.includes('punch')||name==='uppercut';
  const ratio=Number(asset.data.strikeHeightRatio);
  const strikeRatio=Number.isFinite(ratio)?ratio:
    ({kick:.62,'low-kick':.22,'crouch-kick':.15,'crouch-high-kick':.49,'power-kick':.48,'jump-kick':.35}[name]??.55);
  const frames=Object.fromEntries(['left','right'].map(facing=>[facing,asset.data.frames[facing].map((frame,index)=>{
    const scale=poseScale(asset,frame),offset=frame.offset??[0,0],bounds=frame.opaqueBounds??[0,0,frame.rect[2],frame.rect[3]];
    const point=([x,y])=>({x:(x+offset[0]-frame.anchor[0])*scale,y:(y+offset[1]-frame.anchor[1])*scale});
    const a=point(bounds.slice(0,2)),b=point(bounds.slice(2)),bodyHeight=Math.max(20,b.y-a.y);
    const sites=resolvePoseAttachments(frame,name,index,facing,fighter.manifest.id);
    const head=point([sites.head.x,sites.head.y]),torso=point([sites.torso.x,sites.torso.y]),legs=point([sites.legs.x,sites.legs.y]);
    const box=(site,x1,y1,x2,y2)=>({site,left:Math.max(a.x,x1),top:Math.max(a.y,y1),right:Math.min(b.x,x2),bottom:Math.min(b.y,y2)});
    const headRadius=Math.min(height*.09,bodyHeight*.11),bodyRadius=Math.min(height*.15,(b.x-a.x)*.30);
    const hip=legs.y-bodyHeight*.08;
    const hurt=nativeHurtRegions(frame,point)??[box('head',head.x-headRadius,head.y-headRadius,head.x+headRadius,head.y+headRadius),
      box('torso',Math.min(torso.x,legs.x)-bodyRadius,head.y+headRadius*.7,Math.max(torso.x,legs.x)+bodyRadius,hip),
      box('legs',legs.x-bodyRadius*.8,hip-bodyHeight*.06,legs.x+bodyRadius*.8,b.y)]
      .filter(region=>region.right>region.left&&region.bottom>region.top);
    const authoredStrike=frame.attachments?.strike;
    const strike=authoredStrike?point(authoredStrike):hand?point([sites.grip.x,sites.grip.y]):
      {x:facing==='left'?a.x:b.x,y:Math.max(a.y,Math.min(b.y,-height*strikeRatio+offset[1]*scale))};
    const armStart=name==='uppercut'?.28:.75;
    const strikeStart=frame.attachments?.strikeStart?point(frame.attachments.strikeStart):
      hand?{x:torso.x+(strike.x-torso.x)*armStart,y:torso.y+(strike.y-torso.y)*armStart}:
        {x:torso.x,y:torso.y+(legs.y-torso.y)*.45};
    return {bounds:{left:a.x,top:a.y,right:b.x,bottom:b.y},hurt,measuredHurt:!!frame.combatHurt,...nativePushRegions(frame,point),strike,strikeStart,
      sites:{head,torso,legs,grip:point([sites.grip.x,sites.grip.y])},
      strikeRadius:Math.max(9,Math.min(hand?16:20,height*(hand?.04:.055))),
};
  })]));
  const contact=asset.data.contactMs;
  const active=asset.timeline.entries.find(entry=>contact>=entry.start&&contact<entry.end);
  return {combatPoses:{frames,entries:asset.timeline.entries,duration:asset.timeline.duration,loop:asset.data.loop??['idle','walk'].includes(name)},
    ...(active?{activeEndMs:Number.isFinite(asset.data.activeEndMs)?Math.max(contact,Math.min(asset.timeline.duration,asset.data.activeEndMs)):active.end}:{})};
}

export function combatMetadata(art,weaponArt) {
  return art.map(fighter=>Object.fromEntries(Object.entries(fighter.clips).map(([name,asset])=>[name,{
    duration:asset.timeline.duration,
    ...compileCombatPoses(asset,name,fighter),
    contactMs:asset.data.contactMs,
    reactionStartMs:asset.data.reactionStartMs,
    ...(['grab','grab-low','grab-high'].includes(name)?{liftMs:asset.data.liftMs,releaseMs:asset.data.releaseMs}:{}),
    ...(name==='thrown'?{airborneStartMs:asset.timeline.entries[1]?.start??0,airborneExtendedMs:asset.timeline.entries[2]?.start??0,airborneEndMs:Math.max(0,asset.timeline.entries.at(-1).start-.001)}:{}),
    loop:asset.data.loop ?? (name === 'idle' || name === 'walk'),
    endOffsetX:Object.fromEntries(['left','right'].map(facing=>[facing,(asset.data.frames[facing].at(-1).offset?.[0] ?? 0)*poseScale(asset,asset.data.frames[facing].at(-1))])),
    topOffsets:Object.fromEntries(['left','right'].map(facing=>[facing,Math.min(...asset.data.frames[facing].map(frame=>((frame.opaqueBounds?.[1]??0)+(frame.offset?.[1]??0)-frame.anchor[1])*poseScale(asset,frame)))])),
    ...(Number.isFinite(asset.data.channelMs)?{channelMs:asset.data.channelMs}:{}),
    ...(name.startsWith('delete-')?Object.fromEntries(['grip','head','torso','strike'].map(site=>['contact'+site[0].toUpperCase()+site.slice(1)+'Origins',Object.fromEntries(['left','right'].map(facing=>{
      const index=poseFrameIndex(asset,{clip:name,elapsed:asset.data.contactMs,facing}),frame=asset.data.frames[facing][index],offset=frame.offset??[0,0];
      const points=resolvePoseAttachments(frame,name,index,facing,fighter.manifest.id),raw=frame.attachments?.[site],point=raw?{x:raw[0],y:raw[1]}:points[site]??points.grip;
      return [facing,{x:(point.x+offset[0]-frame.anchor[0])*poseScale(asset,frame),y:(point.y+offset[1]-frame.anchor[1])*poseScale(asset,frame)}];
    }))])):{}),
    ...(name==='delete-nail'?{contactNailTipOrigins:Object.fromEntries(['left','right'].map(facing=>{
      const index=poseFrameIndex(asset,{clip:name,elapsed:asset.data.contactMs,facing}),frame=asset.data.frames[facing][index],offset=frame.offset??[0,0],point=resolvePoseAttachments(frame,name,index,facing,fighter.manifest.id).grip;
      return [facing,{x:(point.x+offset[0]-frame.anchor[0])*poseScale(asset,frame)-.3,y:(point.y+offset[1]-frame.anchor[1])*poseScale(asset,frame)+112}];
    }))}:{}),
    ...(name==='punch'&&weaponArt?compileWeaponOrigins(asset,weaponArt):{}),
    ...(name==='pickup'?{
      alignMs:asset.data.alignMs??230,
      pickupOrigins:Object.fromEntries(['left','right'].map(facing=>{
        const index=poseFrameIndex(asset,{clip:name,elapsed:asset.data.contactMs,facing});
        const frame=asset.data.frames[facing][index],offset=frame.offset??[0,0];
        const points=resolvePoseAttachments(frame,name,index,facing,fighter.manifest.id);
        return [facing,{x:(points.grip.x+offset[0]-frame.anchor[0])*poseScale(asset,frame),
          y:(points.grip.y+offset[1]-frame.anchor[1])*poseScale(asset,frame),angle:weaponAttachment({facing},points).angle}];
      })),
    }:{}),
  }])));
}

export async function loadFightArt({bundle,baseURL,ids=['6-bit','9-bit'],onProgress=()=>{}} = {}) {
  const imageCache = new Map();
  const imageFor = key => {
    if (!imageCache.has(key)) imageCache.set(key, new Promise((resolve,reject)=>{
      const image = new Image();
      image.onload = ()=>resolve(image);
      image.onerror = ()=>reject(new Error('A fighter image did not load. Reload the game and try again.'));
      image.src = bundle?.images[key] ?? new URL(key,baseURL).href;
    }));
    return imageCache.get(key);
  };
  let completed = 0;
  const art = await Promise.all(ids.map(async id=>{
    const path = `assets/fighters/${id}/manifest.json`;
    let manifest = bundle?.manifests[id];
    if (!manifest) {
      const response = await fetch(new URL(path,baseURL),{cache:'no-store'});
      if (!response.ok) throw new Error('The fighter files are unavailable. Reload the game and try again.');
      manifest = await response.json();
    }
    const names = [...ACTIONS,...['grab','grab-low','grab-high'].filter(name=>manifest.clips?.[name])];
    const clips = Object.fromEntries(await Promise.all(names.map(async name=>{
      const data = manifest.clips?.[name];
      if (!data) throw new Error(`${manifest.character} needs its ${name} poses.`);
      const image = await imageFor(fightImagePath(path,data,bundle));
      const asset = compileFightClip(data,image,manifest,name);
      if(ACTIONS.includes(name))onProgress(++completed,ids.length*ACTIONS.length);
      return [name,asset];
    })));
    for (const facing of ['left','right']) {
      const last = clips.knockdown.data.frames[facing].at(-1);
      const first = clips.getup.data.frames[facing][0];
      if (JSON.stringify(last) !== JSON.stringify(first) || clips.knockdown.scale !== clips.getup.scale) throw new Error(`${manifest.character}: recovery must start from the same fallen pose.`);
    }
    return {manifest,clips};
  }));
  return art;
}

export async function loadDeletionArt({bundle,baseURL,art}) {
  const readManifest=async(key,path)=>{
    if(bundle?.deletions?.[key])return bundle.deletions[key];
    const response=await fetch(new URL(path,baseURL),{cache:'no-store'});
    if(!response.ok)throw new Error('The Deletion assets are unavailable. Reload the game and try again.');
    return response.json();
  };
  const imageCache=new Map();
  const loadImage=key=>{
    if(!imageCache.has(key))imageCache.set(key,new Promise((resolve,reject)=>{
      const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('A Deletion asset did not load.'));
      image.src=bundle?.images[key] ?? new URL(key,baseURL).href;
    }));
    return imageCache.get(key);
  };
  for(const fighter of art) {
    const id=fighter.manifest.id;
    const path=`assets/deletions/${id}/manifest.json`,manifest=await readManifest(id,path);
    fighter.deletionManifest=manifest;
    for(const [name,data] of Object.entries(manifest.clips)) {
      const image=await loadImage(assetPath(path,data.file));
      fighter.clips['delete-'+name]=compileFightClip(data,image,manifest,'delete-'+name);
    }
  }
  const path='assets/deletions/broadcast-cut/atlas.json';
  const manifest=await readManifest('broadcast-cut',path);
  const image=await loadImage(assetPath(path,manifest.file));
  for(const [key,frame] of Object.entries(manifest.frames)) {
    const [x,y,w,h]=frame.rect;
    if(x<0||y<0||w<=0||h<=0||x+w>image.width||y+h>image.height)throw new Error(`CRT ${key}: invalid source crop.`);
  }
  const frontPath='assets/deletions/broadcast-cut/front-entry.json';
  const frontManifest=await readManifest('broadcast-front',frontPath);
  const frontImage=await loadImage(assetPath(frontPath,frontManifest.file));
  for(const frame of Object.values(frontManifest.frames)) {
    const [x,y,w,h]=frame.rect;
    if(x<0||y<0||w<=0||h<=0||x+w>frontImage.width||y+h>frontImage.height)throw new Error('Front glass: invalid source crop.');
  }
  const additional={};
  for(const id of new Set(art.map(fighter=>{const definition=deletionDefinition(fighter.manifest.id);return definition?.prop===false?null:definition?.id;}).filter(id=>id&&id!=='broadcast-cut'))) {
    const propPath=`assets/deletions/${id}/atlas.json`,propManifest=await readManifest(id,propPath);
    const propImage=await loadImage(assetPath(propPath,propManifest.file));
    const images={};
    for(const frame of [...Object.values(propManifest.frames),...Object.values(propManifest.utilityFrames??{})]) {
      const filename=frame.file??propManifest.file;
      if(frame.file&&!images[filename])images[filename]=await loadImage(assetPath(propPath,filename));
      const source=images[filename]??propImage;
      const [x,y,w,h]=frame.rect;
      if(x<0||y<0||w<=0||h<=0||x+w>source.width||y+h>source.height)throw new Error(`${id}: invalid prop crop.`);
    }
    additional[id]={manifest:propManifest,image:propImage,images};
  }
  return {manifest,image,front:{manifest:frontManifest,image:frontImage},additional};
}

export async function loadArcadeArt({bundle,baseURL,art}) {
  const imageCache=new Map();
  await Promise.all(art.map(async fighter=>{
    const id=fighter.manifest.id,path=`assets/arcade/${id}/manifest.json`;
    let manifest=bundle?.arcade?.[id];
    if(!manifest){const response=await fetch(new URL(path,baseURL),{cache:'no-store'});if(!response.ok)throw new Error(`${fighter.manifest.character}: arcade poses unavailable.`);manifest=await response.json();}
    const clips=await Promise.all(['low-punch','low-kick','jump','uppercut','crouch-punch','crouch-kick','jump-punch','jump-kick','pickup','crouch-high-kick','double-punch','power-kick'].map(async name=>{
      const data=manifest.clips[name];
      if(!data)throw new Error(`${fighter.manifest.character}: ${name} poses unavailable.`);
      const key=fightImagePath(path,data,bundle);
      if(!imageCache.has(key))imageCache.set(key,new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('An arcade pose sheet did not load.'));image.src=bundle?.images[key] ?? new URL(key,baseURL).href;}));
      return [name,compileFightClip(data,await imageCache.get(key),manifest,name)];
    }));
    Object.assign(fighter.clips,Object.fromEntries(clips));
    fighter.arcadeManifest=manifest;
  }));
}

export async function loadWeaponArt({bundle,baseURL} = {}) {
  const path='assets/weapons/manifest.json';
  let manifest=bundle?.weapons;
  if(!manifest) {
    const response=await fetch(new URL(path,baseURL),{cache:'no-store'});
    if(!response.ok)throw new Error('Weapon artwork is unavailable. Reload the game and try again.');
    manifest=await response.json();
  }
  const key=assetPath(path,manifest.file);
  const image=await new Promise((resolve,reject)=>{
    const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('The weapon prop sheet did not load.'));
    img.src=bundle?.images[key] ?? new URL(key,baseURL).href;
  });
  for(const type of ['neural-spike','pulse-driver']) {
    const weapon=manifest.weapons?.[type];
    if(!weapon || !Number.isFinite(weapon.drawWidth) || weapon.drawWidth<=0)throw new Error('Weapon size metadata is missing.');
    for(const facing of ['left','right']) {
      const frame=weapon.frames?.[facing],rect=frame?.rect;
      if(!Array.isArray(rect)||rect.length!==4||!rect.every(Number.isFinite)||rect[0]<0||rect[1]<0||rect[2]<=0||rect[3]<=0||rect[0]+rect[2]>image.width||rect[1]+rect[3]>image.height)throw new Error('Weapon source crop is invalid.');
      for(const anchor of ['grip','tip'])if(!Array.isArray(frame[anchor])||frame[anchor].length!==2||!frame[anchor].every(Number.isFinite)||frame[anchor][0]<0||frame[anchor][1]<0||frame[anchor][0]>rect[2]||frame[anchor][1]>rect[3])throw new Error('Weapon attachment metadata is invalid.');
    }
  }
  const damagePath='assets/weapons/damage-manifest.json';
  let damageManifest=bundle?.damage;
  if(!damageManifest) {
    const response=await fetch(new URL(damagePath,baseURL),{cache:'no-store'});
    if(!response.ok)throw new Error('The damage textures are unavailable. Reload the game and try again.');
    damageManifest=await response.json();
  }
  const damageKey=assetPath(damagePath,damageManifest.file);
  const damageImage=await new Promise((resolve,reject)=>{
    const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('The damage texture sheet did not load.'));
    img.src=bundle?.images[damageKey] ?? new URL(damageKey,baseURL).href;
  });
  for(const name of ['cut','bruise','cloth','metal']) {
    const rect=damageManifest.decals?.[name]?.rect;
    if(!Array.isArray(rect)||rect.length!==4||!rect.every(Number.isFinite)||rect[0]<0||rect[1]<0||rect[2]<=0||rect[3]<=0||rect[0]+rect[2]>damageImage.width||rect[1]+rect[3]>damageImage.height)throw new Error('Damage texture source crop is invalid.');
  }
  return {manifest,image,damage:{manifest:damageManifest,image:damageImage}};
}

// Keep only the selected room and its immediately preceding neighbour decoded.
// Failures are returned as warnings; scenery can always use its native fallback.
const stageArtCache=[];
export async function loadStageArt({id='radio-studio',bundle,baseURL}={}) {
  id=stageById(id).id;
  const source=String(baseURL??globalThis.location?.href??'https://system-clash.invalid/');
  const existing=stageArtCache.find(entry=>entry.id===id&&entry.bundle===bundle&&entry.source===source);
  if(existing){stageArtCache.splice(stageArtCache.indexOf(existing),1);stageArtCache.push(existing);return existing.promise;}
  const entry={id,bundle,source,promise:null};
  entry.promise=(async()=>{
    const warnings=[];
    const imageFor=async key=>{
      try{return await new Promise((resolve,reject)=>{
        const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('Image unavailable'));
        image.src=bundle?.images?.[key]??new URL(key,source).href;
      });}catch{warnings.push(`${key}: image unavailable`);return null;}
    };
    const layersFor=async()=>{
      const embedded=bundle?.stages?.[id]??bundle?.stageLayers?.[id];if(embedded)return embedded;
      const key=`assets/stages/${id}-layers.json`;
      try{const response=await fetch(new URL(key,source),{cache:'no-store'});if(!response.ok)throw new Error('Metadata unavailable');return await response.json();}
      catch{warnings.push(`${key}: layers unavailable`);return null;}
    };
    const [image,kit,layers]=await Promise.all([imageFor(`assets/stages/${id}.webp`),imageFor(`assets/stages/${id}-kit.webp`),layersFor()]);
    if(warnings.length){const index=stageArtCache.indexOf(entry);if(index>=0)stageArtCache.splice(index,1);}
    return {id,image,kit,layers,warnings};
  })();
  stageArtCache.push(entry);while(stageArtCache.length>2)stageArtCache.shift();
  return entry.promise;
}
