// Comic instrument paint reads the road's existing simulation clock and poses.
// No cached Canvas, filters, particles, timers or additional render owner.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({name:'src/game/cache-road-instruments.js',
  exports:['BARCODE.CacheRoadInstruments'],dependencies:['BARCODE.ControllerSettings']});
(function(B) {
  'use strict';
  const INK='#071521',PAPER='#e4f4e8',MUTED='#89a7a6';
  const SKILLS=Object.freeze([
    Object.freeze({name:'attack',index:5,key:'F',color:'#ff917d'}),
    Object.freeze({name:'turbo',index:4,key:'SPACE',color:'#c1afff'}),
    Object.freeze({name:'defend',index:6,key:'G',color:'#77ddff'}),
    Object.freeze({name:'disrupt',index:7,key:'V',color:'#a3f0e8'})
  ]);
  const TIERS=Object.freeze({cold:{label:'COLD',color:'#93b9c2'},
    charged:{label:'CHARGED',color:'#b7f7aa'},rush:{label:'RUSH',color:'#ffe18a'}});
  const clamp=(n,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(n)||0));
  function shape(ctx,x,y,w,h) {
    ctx.beginPath();ctx.moveTo(x+7,y);ctx.lineTo(x+w-7,y);ctx.lineTo(x+w,y+7);
    ctx.lineTo(x+w,y+h-7);ctx.lineTo(x+w-7,y+h);ctx.lineTo(x+7,y+h);
    ctx.lineTo(x,y+h-7);ctx.lineTo(x,y+7);ctx.closePath();
  }
  function panel(ctx,x,y,w,h,color,active=false) {
    shape(ctx,x,y,w,h);ctx.fillStyle=active?'#183b39f5':'#0a202bf3';ctx.fill();
    ctx.lineJoin='round';ctx.lineWidth=4;ctx.strokeStyle=INK;ctx.stroke();
    ctx.lineWidth=1;ctx.strokeStyle=active?color:'#49636b';ctx.stroke();
    ctx.fillStyle=color;ctx.fillRect(x+8,y+1,Math.min(29,w-16),2);
    ctx.fillStyle='#c3ead01a';ctx.fillRect(x+8,y+h-3,w-16,1);
  }
  function text(ctx,value,x,y,size=12,color=PAPER,align='left',maxWidth=200) {
    ctx.font=`bold ${size}px Oxanium, sans-serif`;ctx.fillStyle=color;
    ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillText(String(value),x,y,maxWidth);
  }
  function glyph(ctx,name,x,y,size=20,color=PAPER) {
    ctx.save();ctx.translate(x,y);ctx.scale(size/24,size/24);ctx.strokeStyle=color;
    ctx.lineWidth=2.3;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();
    if(name==='attack') {
      // A muzzle / bolt differs from Turbo's double travelling chevrons.
      ctx.moveTo(-9,-6);ctx.lineTo(3,-6);ctx.lineTo(3,-2);ctx.lineTo(9,-2);
      ctx.lineTo(9,3);ctx.lineTo(-1,3);ctx.lineTo(-3,8);ctx.lineTo(-7,8);
      ctx.lineTo(-6,2);ctx.lineTo(-9,2);ctx.closePath();
      ctx.moveTo(11,-5);ctx.lineTo(14,-8);ctx.moveTo(12,5);ctx.lineTo(15,7);
    } else if(name==='turbo') {
      for(const offset of [-6,3]) {ctx.moveTo(offset-4,-8);ctx.lineTo(offset+4,0);ctx.lineTo(offset-4,8);}
    } else if(name==='defend'||name==='guard') {
      ctx.moveTo(0,-10);ctx.lineTo(9,-6);ctx.lineTo(7,4);ctx.lineTo(0,11);
      ctx.lineTo(-7,4);ctx.lineTo(-9,-6);ctx.closePath();
      ctx.moveTo(-4,0);ctx.lineTo(-1,3);ctx.lineTo(5,-4);
    } else if(name==='disrupt') {
      ctx.arc(0,0,4,0,Math.PI*2);ctx.moveTo(-7,-7);ctx.arc(0,0,10,-2.4,-.7);
      ctx.moveTo(7,7);ctx.arc(0,0,10,.7,2.4);
      ctx.moveTo(-12,0);ctx.lineTo(-8,0);ctx.moveTo(8,0);ctx.lineTo(12,0);
    } else if(name==='recharge') {
      ctx.arc(0,0,9,-2.6,2.2);ctx.moveTo(-8,7);ctx.lineTo(-9,2);ctx.lineTo(-4,3);
      ctx.moveTo(0,-5);ctx.lineTo(0,0);ctx.lineTo(4,2);
    } else if(name==='pulse') {
      ctx.moveTo(-12,1);ctx.lineTo(-6,1);ctx.lineTo(-2,-9);ctx.lineTo(3,10);
      ctx.lineTo(7,-3);ctx.lineTo(10,1);ctx.lineTo(14,1);
    } else if(name==='check') {
      ctx.moveTo(-8,0);ctx.lineTo(-2,6);ctx.lineTo(9,-7);
    } else if(name==='miss') {
      ctx.moveTo(-7,-7);ctx.lineTo(7,7);ctx.moveTo(7,-7);ctx.lineTo(-7,7);
    }
    ctx.stroke();ctx.restore();
  }
  function drawSkills(ctx,s,pose) {
    if(!pose?.skills)return false;
    ctx.save();ctx.globalAlpha=1;
    for(let i=0;i<SKILLS.length;i++) {
      const item=SKILLS[i],skill=pose.skills[item.name]||{},x=1366+i*128,y=102;
      const active=(skill.activeMs||0)>0||(item.name==='turbo'&&s.boostMs>0);
      const queued=item.name==='turbo'&&s.queuedTurbo;
      const color=active||queued?PAPER:skill.ready?item.color:MUTED;
      panel(ctx,x,y,122,56,item.color,active||queued);
      glyph(ctx,item.name,x+15,y+11,15,color);
      text(ctx,item.name.toUpperCase(),x+29,y+11,11,color,'left',86);
      const label=B.ControllerSettings?.prompt?.(`road_${item.name}`,item.key)||item.key;
      B.CacheRoadGuidance?.drawButton(ctx,{index:item.index,x:x+26,y:y+34,size:28,
        label,active:skill.ready,disabled:!skill.ready&&!active&&!queued,
        road:{state:{combat:{version:4}}}});
      const state=queued?'NEXT 1':active?'ACTIVE':skill.inFlight?'IN FLIGHT':
        skill.ready?'READY':`${((skill.cooldownMs||0)/1000).toFixed(1)}s`;
      text(ctx,state,x+48,y+33,10,color,'left',67);
      // Two outlined ammunition sockets stay visible while the shot travels.
      if(item.name==='attack')for(let pip=0;pip<2;pip++) {
        const px=x+99+pip*9;
        ctx.fillStyle=pip<(skill.charges||0)?item.color:'#122f38';
        ctx.fillRect(px,y+41,5,5);ctx.strokeStyle='#69928e';ctx.lineWidth=1;ctx.strokeRect(px+.5,y+41.5,4,4);
      }
      const ratio=skill.ready?1:clamp(1-(skill.cooldownMs||0)/(skill.rechargeMs||6000));
      ctx.fillStyle='#1e3c45';ctx.fillRect(x+8,y+49,106,3);
      ctx.fillStyle=active?PAPER:skill.ready?item.color:'#719891';ctx.fillRect(x+8,y+49,106*ratio,3);
      if(skill.ready) {ctx.fillStyle=item.color;ctx.fillRect(x+114,y+48,2,5);}
    }
    // Four sockets communicate live sync without repeating a long sentence.
    // The existing summary sits just below the machined bezel. Give those
    // small readings their own ink so bright skylines cannot wash them out.
    ctx.fillStyle='#081b23f5';ctx.fillRect(1358,159,522,15);
    ctx.strokeStyle='#426966';ctx.lineWidth=1;ctx.beginPath();
    ctx.moveTo(1358,173.5);ctx.lineTo(1880,173.5);ctx.stroke();
    for(let i=0;i<4;i++) {
      ctx.fillStyle=i<(pose.syncCount||0)?'#b9ffd9':'#263e42';ctx.fillRect(1367+i*8,163,5,4);
    }
    text(ctx,`SYNC ${pose.syncCount||0}/4`,1406,166,10,MUTED,'left',72);
    glyph(ctx,'attack',1530,166,12,'#ffba9a');
    text(ctx,`×${Number(pose.benefits?.power||1).toFixed(2)}`,1543,166,10,PAPER,'left',52);
    glyph(ctx,'recharge',1684,166,12,'#a3f0e8');
    text(ctx,`${((pose.benefits?.ammoMs||4500)/1000).toFixed(1)}s`,1698,166,10,PAPER,'left',52);
    ctx.restore();return true;
  }
  function adrenalinePose(s) {
    return s.adrenaline?.version===1?B.CacheRoadAdrenaline?.pose?.(s.adrenaline):null;
  }
  function rewardPose(s,{reduced=false}={}) {
    const a=adrenalinePose(s);if(!a)return null;
    const age=(s.elapsedMs||0)-(a.lastAtMs||0);
    const recent=!!a.lastResult&&age>=0&&age<1200;
    const earned=recent&&['good','perfect'].includes(a.lastResult);
    const beat=B.CacheRoadBeatFeedback?.feedbackPose?.(s,{reduced});
    const paired=beat&&beat.atMs===a.lastAtMs&&beat.quality===a.lastResult&&
      beat.value===a.value&&beat.delta===a.lastDelta?beat:null;
    const before=clamp(a.value-(a.lastDelta||0),0,100);
    const previousTier=before>=70?'rush':before>=35?'charged':'cold';
    const quiet=reduced||window.BARCODE_RENDER_QUALITY?.flashes===false;
    // The value always paints in full. Only the ink over the genuinely earned
    // interval sweeps, so a delayed animation never implies unavailable power.
    const progress=quiet?1:clamp(age/560),sweep=1-Math.pow(1-progress,3);
    return {a,age,recent,earned,quiet,before,after:a.value,
      from:before/100,to:a.ratio,head:before/100+(a.ratio-before/100)*sweep,
      quality:earned?a.lastResult:null,chain:Math.max(0,a.chain||0),
      tierChanged:earned&&(paired?paired.tierChanged:previousTier!==a.tier),
      paired:!!paired,color:paired?.color||(a.lastResult==='perfect'?'#ffe59c':'#b7f7aa')};
  }
  function drawAdrenaline(ctx,s,{x=30,y=240,w=450,h=74,reduced=false}={}) {
    const reward=rewardPose(s,{reduced});if(!reward)return null;
    const {a,age,recent,earned,quiet}=reward;
    const tier=TIERS[a.tier]||TIERS.cold,color=tier.color;
    const delta=recent&&a.lastDelta?`${a.lastDelta>0?'+':''}${a.lastDelta}`:'';
    ctx.save();ctx.globalAlpha=1;panel(ctx,x,y,w,h,color,a.tier==='rush');
    text(ctx,'ADRENALINE',x+16,y+14,12,PAPER,'left',110);
    if(a.chain>0) {
      shape(ctx,x+131,y+5,76,18);ctx.fillStyle='#183c39';ctx.fill();
      ctx.strokeStyle=earned?reward.color:'#71998c';ctx.lineWidth=1;ctx.stroke();
      text(ctx,`CHAIN ×${a.chain}`,x+169,y+14,10,earned?reward.color:PAPER,'center',69);
    }
    if(earned)text(ctx,reward.quality.toUpperCase(),x+218,y+14,11,reward.color,'left',77);
    else if(recent&&['miss','wreck','turbo','disrupt'].includes(a.lastResult))
      text(ctx,a.lastResult.toUpperCase(),x+218,y+14,10,a.lastDelta<0?'#ffab95':MUTED,'left',77);
    text(ctx,tier.label,x+w-58,y+14,11,color,'right',88);
    text(ctx,Math.round(a.value),x+w-17,y+14,16,color,'right',40);
    const pulseSize=earned&&!quiet?24+3*Math.pow(1-clamp(age/700),2):24;
    glyph(ctx,'pulse',x+27,y+38,pulseSize,earned?reward.color:color);
    const bx=x+54,by=y+31,bw=w-125,cells=20,gap=3,cw=(bw-(cells-1)*gap)/cells;
    for(let i=0;i<cells;i++) {
      const start=i/cells,fraction=clamp((a.ratio-start)*cells);
      const cx=bx+i*(cw+gap);
      ctx.fillStyle='#203c46';ctx.fillRect(cx,by,cw,14);
      if(fraction>0) {
        ctx.fillStyle=color;ctx.fillRect(cx,by,cw*fraction,14);
        ctx.fillStyle='#eaffde66';ctx.fillRect(cx,by,cw*fraction,2);
      }
      if(earned&&a.lastDelta>0) {
        const from=clamp((reward.from-start)*cells),to=clamp((reward.head-start)*cells);
        if(to>from) {
          ctx.fillStyle=reward.color;ctx.fillRect(cx+cw*from,by+2,cw*(to-from),10);
          ctx.fillStyle=PAPER;ctx.fillRect(cx+cw*from,by+2,cw*(to-from),2);
        }
      } else if(recent&&a.lastDelta<0) {
        const from=clamp((a.ratio-start)*cells),to=clamp((reward.from-start)*cells);
        if(to>from) {
          ctx.fillStyle='#bd716680';ctx.fillRect(cx+cw*from,by+11,cw*(to-from),3);
        }
      }
    }
    // The two intensity marks stay fixed; benefits scale continuously.
    for(const value of [35,70]) {
      const tx=bx+bw*value/100;
      ctx.fillStyle=a.value>=value?PAPER:'#6b8e92';ctx.beginPath();
      ctx.moveTo(tx-3,by-5);ctx.lineTo(tx+3,by-5);ctx.lineTo(tx,by-1);ctx.closePath();ctx.fill();
      if(reward.tierChanged&&value===(a.tier==='rush'?70:35)) {
        const spread=quiet?5:5+5*(1-clamp(age/700));
        ctx.strokeStyle=reward.color;ctx.lineWidth=2;ctx.beginPath();
        ctx.moveTo(tx-spread,by-4);ctx.lineTo(tx-spread,by-7);ctx.lineTo(tx+spread,by-7);
        ctx.lineTo(tx+spread,by-4);ctx.stroke();
      }
    }
    if(earned&&a.lastDelta>0) {
      const hx=bx+bw*reward.head;
      ctx.fillStyle=reward.color;ctx.beginPath();
      ctx.moveTo(hx-4,by+19);ctx.lineTo(hx+4,by+19);ctx.lineTo(hx,by+15);ctx.closePath();ctx.fill();
      // Three short impact strokes recede after the charge sweeps into place.
      // No unbounded particles, additive layers or full-panel flash.
      if(!quiet&&age<700) {
        const extension=3+7*clamp(age/700),alpha=1-clamp(age/700);
        ctx.globalAlpha=alpha;ctx.strokeStyle=reward.color;ctx.lineWidth=2;
        ctx.beginPath();ctx.moveTo(hx-3,by+19);ctx.lineTo(hx-3-extension,by+19+extension*.3);
        ctx.moveTo(hx+3,by+19);ctx.lineTo(hx+3+extension,by+19+extension*.3);
        ctx.moveTo(hx,by+20);ctx.lineTo(hx,by+23);ctx.stroke();ctx.globalAlpha=1;
      }
    }
    if(delta) {
      text(ctx,delta,x+w-15,y+38,earned?19:17,a.lastDelta>0?reward.color:'#ffab95','right',52);
    } else if(earned&&a.value===100) {
      text(ctx,'MAX',x+w-15,y+38,13,reward.color,'right',52);
    } else if(a.missStreak>0) {
      glyph(ctx,a.missStreak===1?'miss':'recharge',x+w-31,y+38,18,
        a.missStreak===1?'#dfcc9a':'#ffab95');
    } else glyph(ctx,a.tier==='cold'?'pulse':'check',x+w-31,y+38,18,color);
    glyph(ctx,'attack',x+21,y+61,14,'#ffba9a');
    text(ctx,`×${Number(a.power||1).toFixed(2)}`,x+36,y+61,11,PAPER,'left',70);
    glyph(ctx,'recharge',x+157,y+61,14,'#a3f0e8');
    text(ctx,`−${Math.round((1-(a.recharge??1))*100)}%`,x+173,y+61,11,PAPER,'left',70);
    glyph(ctx,'guard',x+290,y+61,14,'#77ddff');
    text(ctx,`+${Math.round(a.guardMs||0)}ms`,x+305,y+61,11,PAPER,'left',82);
    ctx.restore();return {x,y,w,h};
  }
  B.CacheRoadInstruments=Object.freeze({skills:SKILLS,tiers:TIERS,glyph,drawSkills,
    adrenalinePose,rewardPose,drawAdrenaline});
})(window.BARCODE=window.BARCODE||{});
