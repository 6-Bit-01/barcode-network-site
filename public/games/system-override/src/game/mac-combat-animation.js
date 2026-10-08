// Continuous articulated combat poses. The existing game loop supplies time;
// this module has no input, frame, asset, audio or persistence owner.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({name:'src/game/mac-combat-animation.js',exports:['BARCODE.MacCombatAnimation'],dependencies:[]});
(function(B) {
  'use strict';
  const TAU=Math.PI*2, clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const mix=(a,b,t)=>a+(b-a)*t;
  const ease=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
  const point=(x,y)=>({x,y});
  const blend=(a,b,t)=>point(mix(a.x,b.x,t),mix(a.y,b.y,t));
  const rotate=(p,origin,angle)=>{
    const x=p.x-origin.x,y=p.y-origin.y,c=Math.cos(angle),s=Math.sin(angle);
    return point(origin.x+x*c-y*s,origin.y+x*s+y*c);
  };
  // Fixed-length two-joint chains. Neither the arm nor leg stretches on impact.
  function solve(a,b,l1,l2,bend=1) {
    const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||.001;
    const reach=clamp(d,Math.abs(l1-l2)+.01,l1+l2-.01),angle=Math.atan2(dy,dx);
    const c=clamp((l1*l1+reach*reach-l2*l2)/(2*l1*reach),-1,1);
    const jointAngle=angle+bend*Math.acos(c),end=point(a.x+Math.cos(angle)*reach,a.y+Math.sin(angle)*reach);
    return {joint:point(a.x+Math.cos(jointAngle)*l1,a.y+Math.sin(jointAngle)*l1),end};
  }
  const STYLES=Object.freeze({
    mac: {lean:-.035,crouch:0,guardFront:point(42,-189),guardRear:point(20,-181),stride:.62},
    chitin_scuttler:{lean:.12,crouch:15,guardFront:point(37,-158),guardRear:point(-15,-143),stride:.43},
    psion_lancer:{lean:-.08,crouch:0,guardFront:point(45,-160),guardRear:point(-16,-163),stride:.72},
    bile_spitter:{lean:-.035,crouch:11,guardFront:point(44,-137),guardRear:point(-19,-145),stride:.88},
    prism_guard:{lean:.03,crouch:7,guardFront:point(36,-188),guardRear:point(-8,-174),stride:.92},
    rift_stalker:{lean:.13,crouch:17,guardFront:point(44,-137),guardRear:point(-31,-146),stride:.55},
    shock_mantid:{lean:-.04,crouch:5,guardFront:point(41,-164),guardRear:point(-29,-172),stride:.8},
    null_regent:{lean:0,crouch:0,guardFront:point(44,-175),guardRear:point(-35,-183),stride:.95}
  });
  function attackBlend(a,phase,progress) {
    const timing=a?.timing || a || {},elapsed=a?.elapsedMs;
    if(Number.isFinite(elapsed)) {
      const windup=timing.windupMs||90,active=timing.activeMs||90,recovery=timing.recoveryMs||180;
      if(elapsed<windup)return {phase:'windup',weight:ease(elapsed/windup),impact:0};
      if(elapsed<windup+active)return {phase:'active',weight:1,impact:ease((elapsed-windup)/Math.max(1,active*.45))};
      return {phase:'recovery',weight:1-ease((elapsed-windup-active)/recovery),impact:1};
    }
    const t=clamp(progress||0,0,1);
    return phase==='tell'||phase==='windup'?{phase:'windup',weight:ease(t),impact:0}
      : phase==='active'||phase==='attack'?{phase:'active',weight:1,impact:ease(t/.4)}
        :{phase:'recovery',weight:1-ease(t),impact:1};
  }
  function walkFoot(phase,horizontalRatio,front) {
    const t=((phase+(front?0:.5))%1+1)%1,span=110*.6/2*horizontalRatio;
    if(t<.6)return point(mix(span,-span,t/.6),0);
    const swing=(t-.6)/.4;
    return point(mix(-span,span,ease(swing)),-Math.sin(swing*Math.PI)*(9+Math.abs(span)*.12));
  }
  function geometry(registration) {
    const scale=260/registration.pixelScale.standingVisibleHeight;
    const rest=Object.fromEntries(Object.entries(registration.restSkeleton).map(([id,p])=>[id,point(p.x*scale,p.y*scale)]));
    const parts=Object.fromEntries(registration.parts.map(p=>[p.id,p]));
    const length=id=>{const p=parts[id];return Math.hypot(p.distal.x-p.pivot.x,p.distal.y-p.pivot.y)*scale;};
    return {rest,scale,parts,hipHeight:-rest.hip.y,
      arms:{front:[length('front_upper_arm'),length('front_forearm')],rear:[length('rear_upper_arm'),length('rear_forearm')]},
      legs:{front:[length('front_thigh'),length('front_shin')],rear:[length('rear_thigh'),length('rear_shin')]},
      extras:parts.extra_upper_arm_a?{a:[length('extra_upper_arm_a'),length('extra_forearm_a')],b:[length('extra_upper_arm_b'),length('extra_forearm_b')]}:null};
  }
  function sample(actor,{player=false,reducedMotion=false,geometry={},height=260}={}) {
    const kind=player?'mac':actor.kind,style=STYLES[kind]||STYLES.mac;
    const animation=actor.animation||{},motion=animation.motion||{},age=animation.ageMs??actor.animAgeMs??0;
    const speed=motion.speed??Math.hypot(motion.vx??actor.vx??0,motion.laneVelocity??0),walking=speed>3;
    const horizontalRatio=motion.strideRatio??(motion.vx??actor.vx??0)*(actor.facing||animation.facing||1)/Math.max(1,Math.hypot(motion.vx??actor.vx??0,(motion.laneVelocity??0)*.75));
    const phase=motion.stridePhase??(age/(style.stride*1000))%1;
    const breathing=reducedMotion?0:Math.sin((actor.ageMs??age)/710)*1.15;
    let lean=style.lean,drop=style.crouch+(walking&&!reducedMotion?Math.sin(phase*TAU*2)*1.4:breathing);
    let hipX=0,frontHand={...style.guardFront},rearHand={...style.guardRear};
    let frontFoot=walking?walkFoot(phase,horizontalRatio,true):point(25,0);
    let rearFoot=walking?walkFoot(phase,horizontalRatio,false):point(-23,0);
    if(motion.feet){
      // The fixed simulation owns the bounded locomotion transition. Scaling
      // its world-space sole targets here also keeps the larger boss planted.
      const unit=height/260;
      frontFoot=point(motion.feet.front.x/unit,motion.feet.front.y/unit);
      rearFoot=point(motion.feet.rear.x/unit,motion.feet.rear.y/unit);
    }
    let frontBend=-1,rearBend=-1,headAngle=0,fistFrontAngle=0,fistRearAngle=0;
    const action=animation.action||actor.animAction||actor.mode||'idle';
    const airborne=(actor.elevation||motion.elevation||0)>1;
    if(airborne) {
      const lift=ease(clamp((actor.elevation||motion.elevation)/40,0,1));
      frontFoot=blend(frontFoot,point(23,-31),lift);rearFoot=blend(rearFoot,point(-27,-23),lift);drop=mix(drop,3,lift);
      frontHand=blend(frontHand,point(45,-194),lift);rearHand=blend(rearHand,point(-21,-179),lift);
    }
    if(player&&actor.guarding) {
      const t=ease(clamp(age/100,0,1));
      frontHand=blend(frontHand,point(25,-209),t);rearHand=blend(rearHand,point(-3,-195),t);lean=mix(lean,-.09,t);drop=mix(drop,6,t);
      frontFoot=blend(frontFoot,point(31,0),t);rearFoot=blend(rearFoot,point(-27,0),t);
    }
    const attacking=!!actor.attack||['tell','windup','attack','active','recover','recovery'].includes(action);
    const attackType=actor.attack?.kind||motion.attackType||actor.attackKind||'';
    if(attacking) {
      const a=attackBlend(actor.attack,action,motion.phaseProgress??animation.phaseProgress);
      const t=a.weight,w=a.phase==='windup'?t:1-a.impact,k=a.phase==='windup'?0:a.impact;
      let windFront=point(30,-205),windRear=point(12,-198),hitFront=point(112,-180),hitRear=rearHand;
      let windLean=-.1,hitLean=.14;
      if(player) {
        if(attackType==='cross') {windRear=point(7,-204);hitRear=point(103,-177);hitFront=point(35,-199);hitLean=.18;}
        if(attackType==='finisher'||attackType==='counter') {
          windFront=point(15,-154);windRear=point(-25,-193);hitFront=point(101,-214);hitLean=-.02;
          drop+=Math.sin(t*Math.PI)*8;rearFoot=blend(rearFoot,point(-34,0),t);fistFrontAngle=-.65*t;
        }
        if(attackType==='step-strike') {windLean=-.12;hitLean=.24;hitFront=point(119,-167);rearFoot=blend(rearFoot,point(-41,0),t);frontFoot=blend(frontFoot,point(30,0),t);}
        if(attackType==='air-kick') {
          windLean=-.15;hitLean=-.26;hitFront=point(33,-193);hitRear=point(-24,-174);
          frontFoot=blend(frontFoot,blend(point(16,-50),point(118,-132),k),t);rearFoot=blend(rearFoot,point(-32,-30),t);frontBend=-1;
        }
      } else if(kind==='chitin_scuttler') {
        windFront=point(-10,-178);windRear=point(-29,-150);hitFront=point(96,-153);hitLean=.29;
        if(/rush/.test(attackType)){hitRear=point(74,-186);drop+=4*t;rearFoot=blend(rearFoot,point(-36,0),t);}
      } else if(kind==='psion_lancer') {
        windFront=point(-26,-172);hitFront=point(121,-174);windLean=-.17;hitLean=.19;
        if(/sweep/.test(attackType)){windFront=point(13,-235);hitFront=point(102,-127);hitLean=.25;fistFrontAngle=.65*t;}
      } else if(kind==='bile_spitter') {
        windFront=point(50,-186);hitFront=point(61,-164);windRear=point(-40,-168);hitRear=point(-40,-161);
        windLean=.24;hitLean=-.26;headAngle=mix(-.18,.13,k)*t;drop+=7*t;
        if(/spread/.test(attackType)){windFront=point(21,-189);windRear=point(-33,-180);hitFront=point(90,-145);hitRear=point(-64,-143);windLean=.21;hitLean=-.28;headAngle=mix(-.2,.17,k)*t;}
      } else if(kind==='prism_guard') {
        windFront=point(20,-207);hitFront=point(88,-172);windLean=-.07;hitLean=.18;
        if(/heavy/.test(attackType)){windFront=point(7,-260);windRear=point(-13,-253);hitFront=point(81,-128);hitRear=point(38,-137);hitLean=.26;drop+=12*k*t;}
      } else if(kind==='rift_stalker') {
        windFront=point(-30,-181);hitFront=point(106,-132);hitRear=point(-43,-184);windLean=-.19;hitLean=.28;
        if(/retreat/.test(attackType)){windRear=point(-15,-128);hitRear=point(94,-214);hitFront=point(18,-185);hitLean=-.12;}
      } else if(kind==='shock_mantid') {
        windFront=point(19,-252);windRear=point(-19,-237);hitFront=point(76,-133);hitRear=point(-16,-141);
        windLean=-.06;hitLean=.23;drop+=14*k*t;
        if(/leap/.test(attackType)){
          if(airborne){frontFoot=blend(frontFoot,point(30,-29),t);rearFoot=blend(rearFoot,point(-24,-36),t);}
          else if(a.phase==='windup')drop+=22*t;
          hitFront=point(96,-181);hitRear=point(33,-204);
        }
      } else if(kind==='null_regent') {
        windFront=point(16,-247);windRear=point(-31,-236);hitFront=point(119,-160);hitRear=point(-70,-163);
        windLean=-.09;hitLean=.17;if(/wave|slam/.test(attackType)){hitFront=point(70,-112);hitRear=point(-32,-118);drop+=20*k*t;}
        if(/charge/.test(attackType)){windFront=point(-6,-171);windRear=point(-48,-152);hitFront=point(122,-154);hitRear=point(51,-178);windLean=-.18;hitLean=.34;}
        if(/fan/.test(attackType)){windFront=point(13,-192);windRear=point(-13,-188);hitFront=point(113,-217);hitRear=point(-113,-207);windLean=-.08;hitLean=-.13;}
      }
      frontHand=blend(frontHand,blend(windFront,hitFront,k),t);
      rearHand=blend(rearHand,blend(windRear,hitRear,k),t);
      lean=mix(lean,mix(windLean,hitLean,k),t);hipX+=mix(-5,7,k)*t;
      // Anticipation and recovery keep a grounded stance; root movement comes
      // from the simulation, never from independently moving the painted actor.
      if(!airborne&&!walking){frontFoot.x=mix(frontFoot.x,31,t);rearFoot.x=mix(rearFoot.x,-29,t);}
      headAngle-=lean*.3;
    }
    const grapple=actor.grapple;
    if(player&&grapple) {
      const elapsed=grapple.elapsedMs??(grapple.progress||0)*420;
      const keys=[{time:0,front:style.guardFront,rear:style.guardRear,lean:style.lean,drop:style.crouch},
        {time:60,front:point(75,-165),rear:point(55,-150),lean:.13,drop:9},
        {time:120,front:point(61,-175),rear:point(44,-165),lean:-.09,drop:13},
        {time:175,front:point(112,-194),rear:point(89,-177),lean:.2,drop:4},
        {time:265,front:point(75,-213),rear:point(51,-192),lean:.07,drop:2},
        {time:420,front:style.guardFront,rear:style.guardRear,lean:style.lean,drop:style.crouch}];
      const end=Math.max(1,keys.findIndex(k=>k.time>=elapsed)),a=keys[end-1],b=keys[end],t=ease((elapsed-a.time)/(b.time-a.time));
      frontHand=blend(a.front,b.front,t);rearHand=blend(a.rear,b.rear,t);
      lean=mix(a.lean,b.lean,t);drop=mix(a.drop,b.drop,t);
      frontFoot.x=mix(frontFoot.x,30,Math.sin(clamp(elapsed/420,0,1)*Math.PI));
      rearFoot.x=mix(rearFoot.x,-28,Math.sin(clamp(elapsed/420,0,1)*Math.PI));
    }
    if(actor.hurtMs>0||['hurt','hit','stunned'].includes(action)) {
      const t=1-clamp((animation.ageMs??0)/260,0,1);
      lean=-.17*t;hipX=-6*t;headAngle=-.12*t;
      frontHand=point(28,-171);rearHand=point(-11,-158);drop+=8*t;rearFoot=point(-32,0);
    }
    const dying=actor.hp<=0||action==='defeat';
    if(dying) {
      const t=ease(clamp(age/500,0,1));lean=mix(lean,-1.25,t);drop+=92*t;
      frontHand=blend(frontHand,point(43,-66),t);rearHand=blend(rearHand,point(-24,-77),t);
      frontFoot=blend(frontFoot,point(40,-2),t);rearFoot=blend(rearFoot,point(-43,-2),t);headAngle=-.18*t;
    }
    const rest=geometry.rest;
    if(rest){
      frontFoot.y+=rest.front_ankle.y;rearFoot.y+=rest.rear_ankle.y;
      if(!airborne)for(const [side,target] of [['front',frontFoot],['rear',rearFoot]]){
        const anchor=rest[side+'_hip'],lengths=geometry.legs[side],reach=lengths[0]+lengths[1]-.1;
        const dx=target.x-(hipX+anchor.x-rest.hip.x),available=Math.sqrt(Math.max(0,reach*reach-dx*dx));
        drop=Math.max(drop,target.y-anchor.y-available);
      }
    }
    const hip=point(hipX,-(geometry.hipHeight||112)+drop);
    const attach=(id,angle=lean)=>rest?.[id]?rotate(point(hip.x+rest[id].x-rest.hip.x,hip.y+rest[id].y-rest.hip.y),hip,angle):null;
    const body=attach('neck')||rotate(point(hip.x,hip.y-(geometry.torsoLength||94)),hip,lean);
    const shoulders={front:attach('front_shoulder')||rotate(point(hip.x+17,hip.y-81),hip,lean),rear:attach('rear_shoulder')||rotate(point(hip.x-13,hip.y-76),hip,lean)};
    const hips={front:attach('front_hip',lean*.2)||point(hip.x+12,hip.y+2),rear:attach('rear_hip',lean*.2)||point(hip.x-11,hip.y)};
    const armLengths=geometry.armLengths||[47,46],legLengths=geometry.legLengths||[56,55];
    const fa=geometry.arms?.front||armLengths,ra=geometry.arms?.rear||armLengths,fl=geometry.legs?.front||legLengths,rl=geometry.legs?.rear||legLengths;
    const frontArm=solve(shoulders.front,frontHand,fa[0],fa[1],1);
    const rearArm=solve(shoulders.rear,rearHand,ra[0],ra[1],1);
    const frontLeg=solve(hips.front,frontFoot,fl[0],fl[1],frontBend);
    const rearLeg=solve(hips.rear,rearFoot,rl[0],rl[1],rearBend);
    const joints={hip,neck:body,head:body,front_shoulder:shoulders.front,rear_shoulder:shoulders.rear,
      front_hip:hips.front,rear_hip:hips.rear,front_elbow:frontArm.joint,rear_elbow:rearArm.joint,
      front_wrist:frontArm.end,rear_wrist:rearArm.end,front_knee:frontLeg.joint,rear_knee:rearLeg.joint,
      front_ankle:frontLeg.end,rear_ankle:rearLeg.end};
    if(kind==='null_regent')for(const [id,side] of [['a',-1],['b',1]]) {
      const shoulder=attach('extra_shoulder_'+id)||rotate(point(hip.x+side*23,hip.y-55),hip,lean);
      const attack=attacking?Math.sin(clamp(motion.phaseProgress||0,0,1)*Math.PI):0;
      const lengths=geometry.extras?.[id]||[44,43];
      const target=point(side*(53+45*attack),-132-40*attack),arm=solve(shoulder,target,lengths[0],lengths[1],side);
      joints['extra_shoulder_'+id]=shoulder;joints['extra_elbow_'+id]=arm.joint;joints['extra_wrist_'+id]=arm.end;
    }
    return {kind,action,attackType,joints,lean,headAngle,fistFrontAngle,fistRearAngle,dying,
      alpha:dying?1-clamp((age-380)/260,0,1):1,grounded:!airborne,walking,phase};
  }
  const CHAINS={rear_upper_arm:['rear_shoulder','rear_elbow'],rear_forearm:['rear_elbow','rear_wrist'],
    front_upper_arm:['front_shoulder','front_elbow'],front_forearm:['front_elbow','front_wrist'],
    rear_thigh:['rear_hip','rear_knee'],rear_shin:['rear_knee','rear_ankle'],
    front_thigh:['front_hip','front_knee'],front_shin:['front_knee','front_ankle'],
    extra_upper_arm_a:['extra_shoulder_a','extra_elbow_a'],extra_forearm_a:['extra_elbow_a','extra_wrist_a'],
    extra_upper_arm_b:['extra_shoulder_b','extra_elbow_b'],extra_forearm_b:['extra_elbow_b','extra_wrist_b']};
  const ORDER=['rear_shoe','rear_shin','rear_thigh','rear_upper_arm','rear_forearm','rear_fist',
    'extra_upper_arm_a','extra_forearm_a','extra_fist_a','pelvis','torso','head',
    'front_thigh','front_shin','front_shoe','extra_upper_arm_b','extra_forearm_b','extra_fist_b',
    'front_upper_arm','front_forearm','front_fist'];
  function draw(ctx,art,pose,x,feet,height=260,facing=1,alpha=1) {
    const registration=art.registration,parts=art.parts||Object.fromEntries(registration.parts.map(p=>[p.id,p]));
    const unit=height/260,j=pose.joints,commonScale=260/registration.pixelScale.standingVisibleHeight;
    ctx.save();ctx.translate(x,feet);ctx.scale(facing*unit,unit);ctx.globalAlpha=alpha*pose.alpha;
    for(const id of ORDER) {
      const part=parts[id];if(!part)continue;
      const s=part.source,pivot=part.pivot||part.joints?.proximal||{x:s.width/2,y:0};
      let origin,rotation=0,scale=part.restScale??commonScale;
      if(CHAINS[id]) {
        const [a,b]=CHAINS[id];if(!j[a]||!j[b])continue;origin=j[a];
        const distal=part.distal||part.joints?.distal||{x:pivot.x,y:s.height};
        const sourceAngle=Math.atan2(distal.y-pivot.y,distal.x-pivot.x);
        rotation=Math.atan2(j[b].y-j[a].y,j[b].x-j[a].x)-sourceAngle;
      } else if(id==='head'){origin=j.neck;rotation=pose.lean+pose.headAngle;}
      else if(id==='torso'){origin=j.hip;rotation=pose.lean;}
      else if(id==='pelvis'){origin=j.hip;rotation=pose.lean*.2;}
      else if(id.startsWith('extra_fist')){const side=id.at(-1);origin=j['extra_wrist_'+side];rotation=Math.atan2(origin.y-j['extra_elbow_'+side].y,origin.x-j['extra_elbow_'+side].x)-Math.PI/2;}
      else if(id.endsWith('fist')){const side=id.startsWith('rear')?'rear':'front';origin=j[side+'_wrist'];rotation=Math.atan2(origin.y-j[side+'_elbow'].y,origin.x-j[side+'_elbow'].x)-Math.PI/2+(side==='front'?pose.fistFrontAngle:pose.fistRearAngle);}
      else if(id.endsWith('shoe')){origin=j[(id.startsWith('rear')?'rear':'front')+'_ankle'];rotation=pose.grounded?0:-.18;}
      if(!origin)continue;
      ctx.save();ctx.translate(origin.x,origin.y);ctx.rotate(rotation);
      ctx.drawImage(art.image,s.x,s.y,s.width,s.height,-pivot.x*scale,-pivot.y*scale,s.width*scale,s.height*scale);
      ctx.restore();
    }
    ctx.restore();
  }
  B.MacCombatAnimation={sample,draw,solve,geometry,styles:STYLES,order:ORDER};
})(window.BARCODE=window.BARCODE||{});
