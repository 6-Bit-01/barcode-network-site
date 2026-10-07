import {authoredPoseAnchor} from './fight-pose-anchors.mjs';
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const pose = (head, torso, legs, grip) => ({head, torso, legs, grip});

// Coordinates belong to the intact opaque silhouette, not its padded atlas cell.
// Each facing has its own anchors. A fallen right-facing body has its head left.
const RIGHT = {
  idle:[pose([.56,.12],[.50,.42],[.49,.79],[.81,.29])],
  walk:[pose([.61,.12],[.51,.41],[.47,.78],[.77,.30])],
  crouch:[pose([.57,.13],[.49,.42],[.48,.81],[.78,.30]),pose([.61,.15],[.50,.46],[.46,.82],[.78,.33]),pose([.66,.18],[.53,.49],[.46,.84],[.80,.37]),pose([.67,.20],[.52,.50],[.46,.84],[.79,.39])],
  block:[pose([.57,.13],[.48,.43],[.49,.80],[.77,.30]),pose([.59,.17],[.47,.44],[.50,.81],[.68,.20]),pose([.56,.20],[.46,.47],[.57,.81],[.66,.22]),pose([.57,.13],[.49,.42],[.50,.79],[.79,.28])],
  punch:[pose([.56,.12],[.50,.42],[.49,.79],[.80,.29]),pose([.62,.12],[.51,.43],[.49,.80],[.29,.25]),pose([.47,.12],[.37,.41],[.37,.79],[.94,.23]),pose([.56,.12],[.50,.42],[.49,.79],[.80,.29])],
  kick:[pose([.56,.12],[.50,.42],[.49,.79],[.81,.29]),pose([.49,.12],[.44,.41],[.37,.78],[.63,.28]),pose([.29,.13],[.25,.40],[.20,.84],[.41,.29]),pose([.49,.12],[.44,.41],[.37,.78],[.63,.28])],
  'low-punch':[pose([.56,.12],[.50,.42],[.49,.79],[.81,.29]),pose([.63,.15],[.51,.44],[.50,.81],[.43,.48]),pose([.57,.15],[.43,.45],[.42,.82],[.93,.40]),pose([.56,.12],[.50,.42],[.49,.79],[.81,.29])],
  'low-kick':[pose([.56,.12],[.50,.42],[.49,.79],[.81,.29]),pose([.48,.12],[.41,.39],[.37,.79],[.61,.27]),pose([.35,.13],[.32,.41],[.24,.84],[.47,.29]),pose([.48,.12],[.41,.39],[.37,.79],[.61,.27])],
  jump:[pose([.66,.16],[.51,.45],[.43,.83],[.81,.43]),pose([.62,.13],[.52,.42],[.46,.82],[.81,.32]),pose([.56,.15],[.39,.42],[.56,.76],[.69,.35]),pose([.66,.16],[.51,.45],[.43,.83],[.81,.43])],
  uppercut:[pose([.66,.16],[.51,.45],[.43,.83],[.32,.43]),pose([.66,.24],[.51,.51],[.45,.84],[.73,.05]),pose([.47,.28],[.41,.52],[.46,.85],[.63,.04]),pose([.56,.12],[.50,.42],[.49,.79],[.81,.29])],
  high:[pose([.56,.12],[.50,.42],[.49,.79],[.81,.29]),pose([.40,.18],[.47,.45],[.61,.82],[.66,.33]),pose([.35,.21],[.44,.47],[.65,.82],[.61,.44]),pose([.55,.15],[.48,.44],[.52,.81],[.73,.34])],
  low:[pose([.56,.12],[.50,.42],[.49,.79],[.81,.29]),pose([.62,.16],[.52,.45],[.48,.83],[.57,.48]),pose([.66,.21],[.52,.49],[.47,.84],[.62,.53]),pose([.59,.16],[.50,.44],[.49,.82],[.64,.45])],
  grabbed:[pose([.56,.12],[.50,.42],[.49,.79],[.81,.29]),pose([.49,.14],[.50,.44],[.49,.82],[.66,.44]),pose([.46,.18],[.51,.46],[.48,.82],[.64,.45]),pose([.47,.17],[.51,.45],[.48,.82],[.64,.44])],
  thrown:[pose([.55,.13],[.47,.43],[.55,.80],[.68,.30]),pose([.30,.20],[.46,.44],[.76,.78],[.41,.36]),pose([.15,.40],[.39,.51],[.75,.77],[.28,.55]),pose([.10,.52],[.36,.57],[.81,.62],[.32,.62])],
  knockdown:[pose([.56,.12],[.50,.42],[.49,.79],[.81,.29]),pose([.34,.17],[.41,.43],[.71,.81],[.49,.31]),pose([.18,.35],[.39,.53],[.77,.70],[.33,.49]),pose([.10,.51],[.34,.56],[.81,.62],[.35,.61])],
  getup:[pose([.10,.51],[.34,.56],[.81,.62],[.35,.61]),pose([.30,.21],[.43,.55],[.71,.83],[.62,.73]),pose([.55,.17],[.49,.46],[.52,.83],[.55,.64]),pose([.56,.12],[.50,.42],[.49,.79],[.81,.29])],
};
const LEFT = {
  idle:[pose([.44,.12],[.50,.42],[.51,.79],[.20,.29])],
  walk:[pose([.40,.13],[.49,.42],[.53,.79],[.23,.31])],
  crouch:[pose([.44,.14],[.51,.43],[.52,.81],[.23,.31]),pose([.40,.16],[.51,.46],[.54,.82],[.22,.34]),pose([.35,.19],[.47,.50],[.55,.83],[.20,.38]),pose([.34,.21],[.48,.51],[.54,.84],[.22,.39])],
  block:[pose([.43,.13],[.51,.43],[.52,.80],[.22,.29]),pose([.40,.17],[.53,.45],[.50,.81],[.31,.21]),pose([.44,.20],[.54,.47],[.44,.81],[.34,.23]),pose([.43,.14],[.51,.42],[.52,.80],[.22,.29])],
  punch:[pose([.44,.12],[.50,.42],[.51,.79],[.20,.29]),pose([.39,.13],[.49,.43],[.52,.81],[.71,.26]),pose([.53,.13],[.64,.42],[.63,.79],[.06,.24]),pose([.44,.12],[.50,.42],[.51,.79],[.20,.29])],
  kick:[pose([.44,.12],[.50,.42],[.51,.79],[.20,.29]),pose([.52,.13],[.56,.42],[.63,.78],[.37,.29]),pose([.73,.14],[.77,.41],[.80,.84],[.59,.30]),pose([.52,.13],[.56,.42],[.63,.78],[.37,.29])],
  'low-punch':[pose([.44,.12],[.50,.42],[.51,.79],[.20,.29]),pose([.39,.16],[.49,.45],[.51,.81],[.56,.49]),pose([.45,.16],[.58,.46],[.58,.81],[.06,.41]),pose([.44,.12],[.50,.42],[.51,.79],[.20,.29])],
  'low-kick':[pose([.44,.12],[.50,.42],[.51,.79],[.20,.29]),pose([.53,.13],[.59,.40],[.63,.79],[.39,.29]),pose([.67,.14],[.69,.42],[.78,.84],[.55,.30]),pose([.53,.13],[.59,.40],[.63,.79],[.39,.29])],
  jump:[pose([.34,.17],[.49,.46],[.58,.83],[.19,.42]),pose([.39,.14],[.48,.43],[.55,.82],[.20,.33]),pose([.45,.16],[.62,.43],[.43,.77],[.30,.36]),pose([.35,.17],[.49,.45],[.57,.83],[.19,.42])],
  uppercut:[pose([.34,.17],[.49,.46],[.58,.83],[.68,.44]),pose([.36,.25],[.51,.52],[.56,.84],[.28,.05]),pose([.53,.29],[.59,.53],[.55,.85],[.36,.04]),pose([.44,.12],[.50,.42],[.51,.79],[.20,.29])],
  high:[pose([.44,.12],[.50,.42],[.51,.79],[.20,.29]),pose([.60,.19],[.53,.46],[.39,.82],[.35,.34]),pose([.66,.22],[.56,.48],[.36,.82],[.39,.45]),pose([.46,.16],[.52,.45],[.49,.81],[.28,.35])],
  low:[pose([.44,.12],[.50,.42],[.51,.79],[.20,.29]),pose([.39,.17],[.48,.46],[.53,.83],[.43,.49]),pose([.35,.22],[.48,.50],[.54,.84],[.39,.54]),pose([.42,.17],[.50,.45],[.52,.82],[.36,.46])],
  grabbed:[pose([.44,.12],[.50,.42],[.51,.79],[.20,.29]),pose([.52,.15],[.50,.45],[.52,.82],[.35,.45]),pose([.55,.19],[.49,.47],[.53,.82],[.37,.46]),pose([.54,.18],[.49,.46],[.53,.82],[.36,.45])],
  thrown:[pose([.45,.14],[.53,.44],[.46,.80],[.32,.31]),pose([.70,.21],[.54,.45],[.25,.78],[.59,.37]),pose([.86,.41],[.62,.52],[.26,.77],[.73,.56]),pose([.89,.53],[.65,.58],[.20,.62],[.67,.63])],
  knockdown:[pose([.44,.12],[.50,.42],[.51,.79],[.20,.29]),pose([.66,.18],[.59,.44],[.29,.81],[.52,.32]),pose([.84,.36],[.62,.54],[.25,.71],[.68,.50]),pose([.89,.52],[.66,.57],[.20,.63],[.66,.62])],
  getup:[pose([.89,.52],[.66,.57],[.20,.63],[.66,.62]),pose([.71,.22],[.58,.56],[.30,.83],[.37,.74]),pose([.46,.18],[.52,.47],[.49,.83],[.44,.65]),pose([.44,.12],[.50,.42],[.51,.79],[.20,.29])],
};

function poseList(clip, facing) {
  const table = facing === 'left' ? LEFT : RIGHT;
  if (clip === 'delete-crumpled') return table.knockdown.slice(2);
  if (clip === 'delete-compressed' || clip === 'delete-brace') return table.crouch.slice(2);
  if (clip === 'delete-suspended') return table.grabbed;
  if (clip === 'delete-shove') return [table.idle[0],table.punch[2]];
  if (clip === 'delete-pull') return [table.punch[2],table.high[2]];
  return table[clip] ?? table.idle;
}

export function poseFrameIndex(asset, view) {
  const entries = asset.timeline?.entries ?? [];
  const duration = Math.max(1, asset.timeline?.duration ?? 1);
  const elapsed = Math.max(0, view.elapsed ?? 0);
  const looping = asset.data.loop ?? ['idle','walk'].includes(view.clip);
  const time = looping ? elapsed % duration : Math.min(elapsed, duration - .001);
  return (entries.find(entry => time >= entry.start && time < entry.end) ?? entries.at(-1))?.index ?? 0;
}

/** Returns native crop coordinates; uniform draw scale and frame offsets apply later. */
export function resolvePoseAttachments(frame, clip, index, facing = 'right', fighterId = null) {
  const bounds = frame.opaqueBounds ?? [0,0,frame.rect[2],frame.rect[3]];
  const [left,top,right,bottom] = bounds;
  const width = Math.max(1,right-left), height = Math.max(1,bottom-top);
  const poses = poseList(clip,facing), current = poses[Math.min(Math.max(0,index),poses.length-1)];
  const points = Object.fromEntries(Object.entries(current).map(([site,[x,y]]) => [site,{x:left+x*width,y:top+y*height}]));
  const authored=authoredPoseAnchor(frame,clip,index,facing,fighterId);
  if(authored)Object.assign(points,Object.fromEntries(['head','torso','legs','grip','chest'].filter(site=>authored[site]).map(site=>[site,authored[site]])));
  const bodyAngle = authored?.bodyAngle ?? Math.atan2(points.legs.y-points.head.y,points.legs.x-points.head.x)-Math.PI/2;
  const bodyLength = Math.max(20,Math.hypot(points.legs.x-points.head.x,points.legs.y-points.head.y)/.7);
  return {...points,chest:points.chest??points.torso,bodyAngle,bodyLength,bounds,clip,index,facing,authored:!!authored,gripRadius:authored?.gripRadius,gripAngle:authored?.gripAngle,fighterId};
}

export function weaponAttachment(view, attachments, embedded = null) {
  if (embedded) {
    const impactFacing = embedded.facing === 'left' ? -1 : 1;
    const currentFacing = view.facing === 'left' ? -1 : 1;
    const direction = (embedded.direction === -1 ? -1 : 1)*impactFacing*currentFacing;
    // A solid hurl always enters the chest, even when its damage reaction is high
    // or low. The source chest point follows the full native pose through falls.
    const base=attachments.chest??attachments.torso;
    const seed=Number(embedded.seed)||1,anatomy=attachments.bodyLength;
    const across=-direction*anatomy*.035+(noise(seed,137)-.5)*anatomy*.025;
    const along=(noise(seed,491)-.5)*anatomy*.035;
    const cos=Math.cos(attachments.bodyAngle),sin=Math.sin(attachments.bodyAngle);
    const point={x:base.x+across*cos-along*sin,y:base.y+across*sin+along*cos};
    return {point,angle:attachments.bodyAngle+(noise(seed,31)-.5)*.16,facing:direction<0?'left':'right',pivot:'insertion',buriedFraction:.35,site:'torso'};
  }
  const contact = attachments.clip === 'punch' && attachments.index === 2;
  return {point:attachments.grip,angle:attachments.gripAngle??(attachments.bodyAngle*.3+(contact?(view.facing==='left'?.09:-.09):0)),facing:view.facing,pivot:'grip'};
}

/** Native insertion plane: the leading 35% of tip-to-hand length is buried. */
export function weaponInsertionGeometry(frame, buriedFraction = .35) {
  const fraction=clamp(buriedFraction,.25,.45),tip=frame.tip,grip=frame.grip;
  const x=grip[0]-tip[0],y=grip[1]-tip[1],length=Math.max(1,Math.hypot(x,y));
  return {anchor:[tip[0]+x*fraction,tip[1]+y*fraction],outward:[x/length,y/length],buriedFraction:fraction};
}

function noise(seed, shift) {
  const value = Math.imul(((seed ?? 1) >>> 0) ^ shift,1664525)+1013904223;
  return (value >>> 0)/4294967296;
}

const DAMAGE_SITES = ['head','torso','legs'];
const nonnegative = value => Number.isFinite(Number(value)) ? Math.max(0,Number(value)) : 0;
function stableSeed(mark, index) {
  if(Number.isFinite(Number(mark.seed))&&Number(mark.seed)!==0)return Number(mark.seed)>>>0;
  const key=String(mark.id??`${mark.at??0}:${mark.site??'torso'}:${mark.kind??'bruise'}:${index}`);
  let seed=2166136261;for(let i=0;i<key.length;i++)seed=Math.imul(seed^key.charCodeAt(i),16777619);
  return seed>>>0;
}

/** Cumulative injury survives the bounded recent-hit list, including older views. */
export function damageCondition(view = {}) {
  const sites=Object.fromEntries(DAMAGE_SITES.map(site=>[site,{amount:0,hits:0,bruise:0,cut:0,scorch:0}]));
  for(const mark of view.damageMarks??[]) {
    const site=DAMAGE_SITES.includes(mark.site)?mark.site:'torso',amount=nonnegative(mark.amount)||(nonnegative(mark.intensity)||.6)*14;
    const kind=['cut','scorch'].includes(mark.kind)?mark.kind:'bruise';
    sites[site].amount+=amount;sites[site].hits++;sites[site][kind]+=amount;
  }
  for(const site of DAMAGE_SITES)if(view.damageSites?.[site]) {
    const source=view.damageSites[site];
    for(const key of ['amount','hits','bruise','cut','scorch'])sites[site][key]=nonnegative(source[key]);
  }
  const total=Math.max(nonnegative(view.damageTaken),DAMAGE_SITES.reduce((sum,site)=>sum+sites[site].amount,0));
  const inferred=total>=60?3:total>=30?2:total>0?1:0;
  const tier=Math.max(inferred,clamp(Math.floor(nonnegative(view.damageTier)),0,3));
  return {total,tier,sites};
}

function injuryPoint(attachments,site,across,along,anatomy) {
  const base=attachments[site],cos=Math.cos(attachments.bodyAngle),sin=Math.sin(attachments.bodyAngle);
  // Chest weapon anchors are deliberately high. Clothing wear belongs below
  // them, away from the fists held across an upper chest in the fighting stance.
  if(site==='torso')along+=.09;
  // Anatomical across follows the separately authored facing, never the image.
  const localX=across*anatomy*(attachments.facing==='left'?-1:1),localY=along*anatomy;
  return {x:base.x+localX*cos-localY*sin,y:base.y+localX*sin+localY*cos};
}

/** Layered, stable pose-local damage; every layer is clipped to intact native art. */
export function damageOverlayPlans(view, attachments, fighterId, anatomicalSize = attachments.bodyLength) {
  const condition=damageCondition(view);if(!condition.tier)return [];
  const plans=[],anatomy=Math.max(20,Number(anatomicalSize)||attachments.bodyLength);
  const fighterSeed=stableSeed({id:fighterId??'fighter'},0);
  const materials=Object.values(condition.sites).reduce((totals,site)=>({blood:totals.blood+site.bruise+site.cut,scorch:totals.scorch+site.scorch}),{blood:0,scorch:0});
  const dryEnergyOnly=materials.scorch>0&&materials.blood===0;
  const add=(site,effect,across,along,width,height,opacity,seed,extra={})=>plans.push({
    site,effect,point:injuryPoint(attachments,site,across,along,anatomy),angle:attachments.bodyAngle+(noise(seed,509)-.5)*.22,
    width:anatomy*width,height:anatomy*height,opacity:clamp(opacity,0,.96),seed,
    masked:fighterId==='cache-back'&&site==='head',...extra
  });
  // A few larger areas communicate a fighter's condition at actual game scale.
  // They depend on lifetime counters, so subsequent hits cannot erase old wear.
  for(const [index,site] of DAMAGE_SITES.entries()) {
    const own=condition.sites[site],seed=(9137+index*104729+fighterSeed)>>>0,masked=fighterId==='cache-back'&&site==='head';
    const stress=clamp(own.amount/55,0,1),global=clamp(condition.total/100,0,1),severity=Math.max(stress,global*.65);
    const crossWear=condition.tier>=2;
    if(!own.hits&&!crossWear)continue;
    const width=site==='head'?.068:site==='torso'?.23:.15,height=site==='head'?.070:site==='torso'?.19:.16;
    const kind=dryEnergyOnly||own.scorch>Math.max(own.cut,own.bruise)?'scorch':'bruise';
    add(site,kind==='scorch'?'scorch':'wash',0,site==='head'?.032:0,width,height,site==='head'?.10+severity*.13:.16+severity*.24,seed,{source:'condition',kind});
    if(own.hits||condition.tier>=3) {
      const decal=masked?'metal':site==='head'?'bruise':'cloth';
      add(site,'decal',site==='head'?-.015:.015,site==='head'?.036:.012,width*(site==='head'?.75:.9),height*.7,(site==='head'?.42:.55)+severity*.28,seed+1,{source:'condition',decal,kind:'wear'});
    }
    if((own.cut>0||condition.tier>=2)&&kind!=='scorch') {
      add(site,'stain',site==='head'?.024:-.027,site==='head'?.050:.032,width*(site==='head'?.40:.70),height*(site==='head'?.70:.86),.50+severity*.26,seed+2,{source:'condition',kind:'blood'});
      add(site,'drip',site==='head'?.020:-.024,site==='head'?.064:.065,width*.22,height*(site==='head'?.42:.62),.64+severity*.20,seed+3,{source:'condition',kind:'blood'});
    }
    if(site!=='head'&&(own.amount>=15||condition.tier>=3))add(site,'tear',.023,-.004,width*.80,height*.35,.86,seed+4,{source:'condition',kind:'tear'});
  }
  const recent=(view.damageMarks??[]).slice(-12);
  for(const [index,mark] of recent.entries()) {
    const site=DAMAGE_SITES.includes(mark.site)?mark.site:'torso',seed=stableSeed(mark,index);
    const intensity=clamp(Number(mark.intensity)||Number(mark.amount)/14||.6,.25,1.6);
    const kind=mark.kind==='scorch'?'scorch':mark.kind==='cut'?'cut':'bruise',masked=fighterId==='cache-back'&&site==='head';
    // Four persistent lanes spread wounds across anatomy without bouncing when
    // another hit arrives. Seed determines the lane, independent of list index.
    const lane=seed%4,across=(lane%2?1:-1)*(site==='head'?.017:.037)+(noise(seed,173)-.5)*.012;
    const along=(site==='head'?.043:0)+(lane<2?-1:1)*(site==='head'?.011:.032)+(noise(seed,997)-.5)*.012;
    const size=(site==='head'?.052:site==='torso'?.17:.15)*(.82+intensity*.25);
    const decal=masked?(kind==='cut'?'cut':'metal'):kind==='cut'?'cut':site==='head'?'bruise':'cloth';
    add(site,kind==='scorch'?'scorch':'decal',across,along,size,size*(kind==='cut'?.67:.72),(site==='head'?.60:.76)+intensity*.10,seed,{source:'hit',decal,kind,intensity,id:mark.id,anchorSeed:seed});
    if(kind!=='scorch') {
      add(site,'stain',across+(noise(seed,71)-.5)*.014,along+.012,size*(site==='head'?.42:.52),size*(site==='head'?.52:.79),.56+intensity*.15,seed+7,{source:'hit',kind:'blood',intensity,id:mark.id,anchorSeed:seed});
      if(kind==='cut'||(site==='head'&&intensity>.55))add(site,'drip',across,along+(site==='head'?.025:.041),size*.22,size*(site==='head'?.48:.70),.76,seed+11,{source:'hit',kind:'blood',intensity,id:mark.id,anchorSeed:seed});
    }
  }
  return plans;
}

/** Compile the visible contact-hand/muzzle into the engine's optional spawn metadata. */
export function compileWeaponOrigins(asset, weaponArt) {
  const result = {weaponOrigins:{},weaponThrowOrigins:{}};
  const index = poseFrameIndex(asset,{clip:'punch',elapsed:asset.data.contactMs ?? 170});
  for (const facing of ['right','left']) {
    const frame = asset.data.frames[facing][index], scale = asset.scale;
    const attachments = asset.poseAttachments?.[facing]?.[index] ?? resolvePoseAttachments(frame,'punch',index,facing);
    if(!attachments.grip)continue;
    const held = weaponAttachment({facing},attachments);
    const offset = frame.offset ?? [0,0];
    const grip = {x:(held.point.x+offset[0]-frame.anchor[0])*scale,y:(held.point.y+offset[1]-frame.anchor[1])*scale};
    result.weaponThrowOrigins[facing] = grip;
    for (const type of ['neural-spike','pulse-driver']) {
      const spec = weaponArt?.manifest?.weapons?.[type];
      const prop = spec?.frames?.[facing];
      if (!prop) continue;
      const propScale = spec.drawWidth/prop.rect[2];
      const x = (prop.tip[0]-prop.grip[0])*propScale;
      const y = (prop.tip[1]-prop.grip[1])*propScale;
      const cos = Math.cos(held.angle),sin = Math.sin(held.angle);
      (result.weaponOrigins[type] ??= {})[facing] = {x:grip.x+x*cos-y*sin,y:grip.y+x*sin+y*cos};
    }
  }
  return result;
}
