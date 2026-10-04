// Registered controls and compact route guidance share the existing Canvas.
// The SVG masters use these same badge paths; no image load owns a prompt.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({ name: 'src/game/cache-road-guidance.js',
  exports: ['BARCODE.CacheRoadGuidance'], dependencies: ['BARCODE.ControllerSettings'] });
(function(B) {
  'use strict';
  const BADGES = Object.freeze([
    Object.freeze({name:'SURGE',color:'#8bf2a6',key:'K',shape:'chevron',points:[[50,4],[96,40],[79,40],[79,91],[21,91],[21,40],[4,40]]}),
    Object.freeze({name:'PUSH',color:'#ff917d',key:'L',shape:'hexagon',points:[[25,6],[75,6],[98,50],[75,94],[25,94],[2,50]]}),
    Object.freeze({name:'BRACE',color:'#77ddff',key:'J',shape:'shield',points:[[50,4],[92,19],[85,68],[70,87],[50,98],[30,87],[15,68],[8,19]]}),
    Object.freeze({name:'REFILL',color:'#ffe085',key:'I',shape:'square',points:[[10,8],[90,8],[92,10],[92,90],[90,92],[10,92],[8,90],[8,10]]}),
    Object.freeze({name:'TURBO',color:'#c1afff',key:'SPACE',shape:'pill',points:[[-20,18],[112,18],[127,32],[127,68],[112,82],[-20,82],[-28,68],[-28,32]]}),
    Object.freeze({name:'ECHO',color:'#a3f0e8',key:'H',shape:'pill',points:[[-20,18],[112,18],[127,32],[127,68],[112,82],[-20,82],[-28,68],[-28,32]]})
  ]);
  // Historic saves retain their original names and controls. In the combat
  // chase, the same four chart pieces synchronize data; deliberate fighting
  // belongs to the separate shoulder/trigger actions.
  const COMBAT_BADGES = Object.freeze([
    ...BADGES.slice(0,4).map((badge,index)=>Object.freeze({...badge,name:['SYNC A','SYNC B','SYNC X','SYNC Y'][index]})),
    Object.freeze({...BADGES[4],action:'road_turbo'}),
    Object.freeze({...BADGES[5],name:'ATTACK',key:'F',action:'road_attack',color:'#ff917d'}),
    Object.freeze({...BADGES[5],name:'DEFEND',key:'G',action:'road_defend',color:'#77ddff'}),
    Object.freeze({...BADGES[5],name:'DISRUPT',key:'V',action:'road_disrupt',color:'#a3f0e8'})
  ]);
  const combatChase = (road=B.CacheRoadProof)=>road?.chapter?.encounterVersion===4||road?.state?.combat?.version===4;
  const getBadge = (index,road)=> (combatChase(road)?COMBAT_BADGES:BADGES)[index]||BADGES[0];
  function keyboardLabel(action,fallback) {
    const value=window.inputManager?.actionInput?.keyboardBindings?.[action]?.[0];
    return value===' '?'SPACE':value?String(value).toUpperCase():fallback;
  }
  const LANE_COLORS=['#69d9f5','#ffc077','#cd9dff','#91f5bc'];
  const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
  const font=(ctx,size,weight='bold')=>{ctx.font=`${weight} ${size}px Oxanium, sans-serif`;};
  function path(ctx,points) {
    ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();
  }
  function label(index,road) {
    const badges=combatChase(road)?COMBAT_BADGES:BADGES,badge=badges[index];
    if(!badge)return '';
    if(badge.action) {
      const key=keyboardLabel(badge.action,badge.key);
      return B.ControllerSettings?.prompt?.(badge.action,key)||key;
    }
    const key=keyboardLabel(['road_a','road_b','road_x','road_y'][index],badge.key);
    return B.GamepadUI?.connected?B.ControllerSettings?.button(index)||key:key;
  }
  function fittedText(ctx,value,x,y,maxWidth,size=20,color='#d9eee6',align='left') {
    const text=String(value??'');ctx.textAlign=align;ctx.textBaseline='middle';
    let measured=size;font(ctx,measured);
    while(measured>12&&ctx.measureText(text).width>maxWidth)font(ctx,--measured);
    ctx.fillStyle=color;ctx.fillText(text,x,y,maxWidth);
    return {x:align==='center'?x-Math.min(maxWidth,ctx.measureText(text).width)/2:x,
      y:y-measured*.55,w:Math.min(maxWidth,ctx.measureText(text).width),h:measured*1.1};
  }
  function buttonGlyph(ctx,text,cx,cy,size,maxWidth=size*1.6) {
    ctx.strokeStyle='#0b2230';ctx.lineWidth=size*.10;ctx.lineCap='round';ctx.lineJoin='round';
    ctx.beginPath();
    if(text==='✕') {
      ctx.moveTo(cx-size*.3,cy-size*.3);ctx.lineTo(cx+size*.3,cy+size*.3);
      ctx.moveTo(cx+size*.3,cy-size*.3);ctx.lineTo(cx-size*.3,cy+size*.3);ctx.stroke();
    } else if(text==='○') {
      ctx.arc(cx,cy,size*.34,0,Math.PI*2);ctx.stroke();
    } else if(text==='□') {
      ctx.strokeRect(cx-size*.3,cy-size*.3,size*.6,size*.6);
    } else if(text==='△') {
      ctx.moveTo(cx,cy-size*.38);ctx.lineTo(cx+size*.37,cy+size*.28);
      ctx.lineTo(cx-size*.37,cy+size*.28);ctx.closePath();ctx.stroke();
    } else fittedText(ctx,text,cx,cy+1,maxWidth,size,text.length>3?'#12303a':'#0b2230','center');
  }
  function drawButton(ctx,{index=0,x=0,y=0,size=60,label:override,active=false,disabled=false,road,skin=true}={}) {
    const badge=getBadge(index,road),width=size*(index>=4?1.55:1);
    ctx.save();ctx.translate(x-size/2,y-size/2);ctx.scale(size/100,size/100);
    ctx.globalAlpha*=disabled?.38:1;
    // The blank authored face keeps remapped keyboard/Xbox/PlayStation
    // glyphs live and sharp. Physical road pads already paint their skin
    // onto the true trapezoid and ask for the same glyph alone.
    let authoredFace=!skin;
    if(skin) {
      const authored=index<4&&B.CacheRoadBeatSurface?.paintSprite(ctx,'cacheBeatHardware',
        {x:50,y:50,width:112,height:112,frame:index+(active?4:0)});
      authoredFace=!!authored;
      if(!authored) {
        ctx.lineJoin='round';ctx.lineWidth=8;path(ctx,badge.points);
        ctx.strokeStyle='#06141f';ctx.stroke();ctx.fillStyle=badge.color;ctx.fill();
        ctx.lineWidth=2;ctx.strokeStyle=active?'#fffce6':'#ffffff99';ctx.stroke();
        if(active) {ctx.lineWidth=3;ctx.strokeStyle='#fffce6';path(ctx,badge.points);ctx.stroke();}
      }
    }
    buttonGlyph(ctx,override??label(index,road),50,index===0?(authoredFace?35:59):50,
      index>=4?29:43,index>=4?96:69);
    // Tiny register marks distinguish shoulder functions without relying on hue.
    if(index>=4) {
      ctx.strokeStyle='#14303d';ctx.lineWidth=3;ctx.beginPath();
      if(index===4) {ctx.moveTo(-17,42);ctx.lineTo(-9,50);ctx.lineTo(-17,58);}
      else {ctx.arc(-12,50,7,-1,1);ctx.moveTo(-7,39);ctx.arc(-12,50,12,-1,1);}
      ctx.stroke();
    }
    ctx.restore();
    return {x:x-width/2,y:y-size/2,w:width,h:size};
  }
  function panel(ctx,x,y,w,h,accent) {
    path(ctx,[[x+9,y],[x+w-9,y],[x+w,y+9],[x+w,y+h-9],[x+w-9,y+h],[x+9,y+h],[x,y+h-9],[x,y+9]]);
    ctx.fillStyle='#081c28ed';ctx.fill();ctx.strokeStyle='#06141f';ctx.lineWidth=4;ctx.stroke();
    ctx.strokeStyle='#47636b';ctx.lineWidth=1;ctx.stroke();
    ctx.fillStyle=accent;ctx.fillRect(x+1,y+10,3,h-20);
    ctx.fillRect(x+10,y+1,26,2);
  }
  function tape(ctx,x,y,size,color='#ffdd96') {
    ctx.save();ctx.translate(x,y);ctx.scale(size/40,size/40);
    ctx.strokeStyle=color;ctx.lineWidth=2.5;ctx.strokeRect(-20,-12,40,24);
    for(const xx of [-10,10]) {ctx.beginPath();ctx.arc(xx,0,4,0,Math.PI*2);ctx.stroke();}
    ctx.beginPath();ctx.moveTo(-6,0);ctx.lineTo(6,0);ctx.stroke();ctx.restore();
  }
  function laneMark(ctx,lane,x,y,size=24) {
    ctx.save();ctx.translate(x,y);ctx.scale(size/40,size/40);
    ctx.strokeStyle=LANE_COLORS[lane]||'#a4e8da';ctx.lineWidth=3;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();
    if(lane===0)for(const offset of [-10,0,10]){ctx.moveTo(offset-6,12);ctx.lineTo(offset+6,-12);}
    else if(lane===1) {ctx.moveTo(-18,0);ctx.bezierCurveTo(-8,-16,-5,-16,0,0);ctx.bezierCurveTo(5,16,8,16,18,0);}
    else if(lane===2)for(const offset of [-9,9]){ctx.moveTo(offset-7,-13);ctx.lineTo(offset+6,0);ctx.lineTo(offset-7,13);}
    else {ctx.moveTo(-18,6);ctx.lineTo(-8,6);ctx.lineTo(-3,-11);ctx.lineTo(3,14);ctx.lineTo(9,-4);ctx.lineTo(18,-4);}
    ctx.stroke();ctx.restore();
  }
  function objective(road) {
    const s=road.state,bar=s.musicBeatFloat/4;
    if(combatChase(road)) {
      if(s.combat?.boss?.defeated)return {stage:3,title:'PURSUIT DESTROYED',instruction:'DELIVER THE ORIGINAL / KEEP DRIVING'};
      if(bar>=72)return {stage:2,title:'DESTROY THE ENFORCEMENT RIG',instruction:'DODGE THE LOCK / ATTACK ITS OPENINGS'};
      if(bar>=28)return {stage:1,title:'FIGHT THROUGH THE CONVOY',instruction:'ATTACK / DEFEND / DISRUPT / KEEP THE DATA IN SYNC'};
      return {stage:0,title:'SURVIVE THE CHASE',instruction:'FIGHT THE PURSUIT / SYNC THE FOUR DATA PIECES'};
    }
    if(road.chapter?.encounterVersion===3) {
      if(s.pursuit?.defeated)return {stage:3,title:'PURSUIT BROKEN',instruction:'DELIVER THE ORIGINAL / KEEP DRIVING'};
      if(bar>=72)return {stage:2,title:'BREAK THE PURSUIT',instruction:'BAIT THE LOCK / DODGE OR COUNTER'};
      if(bar>=28)return {stage:1,title:'OUTRUN THE ENFORCEMENT',instruction:'EARN POWER / BREAK THROUGH THE CONVOY'};
      return {stage:0,title:'PROTECT THE ORIGINAL',instruction:'FOLLOW THE PADS / WATCH YOUR MIRROR'};
    }
    if(s.gateOpen)return {stage:3,title:'DELIVER THE ORIGINAL',instruction:'EXIT CLEAR  /  KEEP DRIVING'};
    if(s.gateAt!=null&&s.progress>=s.gateAt-220) return {stage:2,title:'SPLIT THE AUDIT',
      instruction:s.echo?'ECHO SENT  /  TAKE THE FAR-RIGHT EXIT':'HOLD LEFT  /  SEND ECHO  /  EXIT RIGHT'};
    if(bar>=90)return {stage:2,title:'PREPARE THE DELIVERY SPLIT',instruction:'HOLD LEFT  /  SAVE ECHO FOR THE EXIT'};
    if(bar>=76)return {stage:2,title:'ESCAPE THE PURSUIT',instruction:'DODGE THE LOCK  /  PROTECT THE ORIGINAL'};
    if(bar>=52)return {stage:2,title:'CROSS THE AUDIT GRID',instruction:'SEND A DECOY  /  CHANGE LANES'};
    if(bar>=28)return {stage:1,title:'CROSS THE FREIGHT LINE',instruction:'DRAFT  /  FIND THE GAP  /  KEEP MOVING'};
    return {stage:0,title:'DELIVER THE ORIGINAL',instruction:'SURVIVE THE ROUTE  /  KEEP THE TAPE SAFE'};
  }
  function lesson(road,{nextPulse,nextCue}={}) {
    const s=road.state,bar=s.musicBeatFloat/4;
    if(combatChase(road)) {
      if(nextPulse&&nextCue?.ready) {
        const inLane=Math.abs(s.lanePos-nextPulse.lane)<=.38;
        return {index:nextPulse.action,active:nextCue.window&&inLane,
          title:nextCue.window&&inLane?'PRESS NOW':`LANE ${nextPulse.lane+1} / ${getBadge(nextPulse.action,road).name}`,
          detail:inLane?'BEAT ONE / REAR-TIRE TARGET':'ENTER THE MARKED LANE / BEAT ONE'};
      }
      const record=road.recordOpportunity?.();
      if(record?.active)return {record:true,title:'OPTIONAL RECORD / HOLD AMBER LANE',detail:'Stay 0.65 seconds. Saved to the pause archive.'};
      if(!s.opening?.held&&bar<12)return {steer:true,title:'LINE UP / SYNC ON ONE',detail:'Match the colored piece when its pad reaches the tires.'};
      if(s.pulseFlashMs>0&&Number.isInteger(s.pulseFlashAction))return {index:s.pulseFlashAction,
        title:`${getBadge(s.pulseFlashAction,road).name} / ON BEAT`,detail:'Keep all four music parts active for optimum power and the lowest tracking footprint.'};
      if(bar>=72&&!s.combat?.boss?.defeated)return {index:5,combat:true,
        title:'ATTACK THE RIG / DODGE ITS LOCK',detail:'Dodging creates an opening. Attack or Turbo contact damages the rig; a dodge alone cannot break it.'};
      if(bar>=12&&bar<16&&!s.opening?.turbo)return {index:4,combat:true,
        title:'TURBO / NEXT ONE',detail:'Skills recharge independently, even with no active sync pieces.'};
      return null;
    }
    if(road.chapter?.encounterVersion===3&&bar>=72&&!s.pursuit?.defeated&&s.rivalWarning)
      return {index:5,title:s.rivalEchoCommitted?'DECOY COMMITTED / MOVE':'LOCKED ATTACK / DODGE',detail:'A clean escape overloads its exposed system. Earned Push, Brace and Turbo can counter contact.'};
    if(s.gateAt!=null&&s.progress>=s.gateAt-220&&!s.gateOpen) return {index:5,
      title:s.echo?'DECOY LEFT / ORIGINAL RIGHT':'ECHO LEFT / EXIT RIGHT',
      detail:s.echo?'Take the far-right marked exit.':'Send the replay, then steer away from it.'};
    if(bar>=56&&bar<59)return {index:5,title:'SEND ECHO / CHANGE LANES',detail:'Let the scanner follow your replay.'};
    if(bar<4&&!nextPulse)return {steer:true,title:'STEER INTO THE MARKED LANE',detail:'Up / Down queues your next gear on ONE.'};
    const record=road.recordOpportunity?.();
    if(record?.active&&(!nextCue||nextCue.remaining>3))return {record:true,title:'OPTIONAL RECORD  /  HOLD AMBER LANE',detail:'Stay 0.65 seconds. Saved to the pause archive.'};
    if(nextPulse&&nextCue?.ready) {
      const inLane=Math.abs(s.lanePos-nextPulse.lane)<=.38;
      return {index:nextPulse.action,active:nextCue.window&&inLane,
        title:nextCue.window&&inLane?'PRESS NOW':`LANE ${nextPulse.lane+1}  /  ${getBadge(nextPulse.action,road).name}`,
        detail:bar<12?(inLane?'Tap on ONE as the pad meets your rear tires.':'Steer into the marked lane, then tap on ONE.'):
          inLane?'BEAT ONE / REAR-TIRE TARGET':'ENTER THE MARKED LANE / BEAT ONE'};
    }
    if(!s.opening?.held&&bar<12)return {steer:true,title:'LINE UP / TAP ON ONE',detail:'Match the colored button when its pad reaches the tires.'};
    if(s.pulseFlashMs>0&&Number.isInteger(s.pulseFlashAction)) {
      const descriptions=['Surge launches on the next ONE.','Push clears your next contact before it expires.',
        'Brace absorbs one impact.','Refill adds Echo charge. Gear 3 also readies Turbo.'];
      return {index:s.pulseFlashAction,title:['SURGE QUEUED','PUSH ARMED','BRACE ARMED','ECHO REFILLED'][s.pulseFlashAction],detail:descriptions[s.pulseFlashAction]};
    }
    if(bar>=12&&bar<16&&!s.opening?.turbo)return {index:4,title:'DRAFT OR PASS CLOSE / TURBO',detail:'Two near misses ready Turbo. Launch on the next ONE.'};
    if(bar>=76&&bar<78)return {index:5,title:'LOCKED LANE / MOVE',detail:'Dodge the rival, or send an Echo to draw it away.'};
    return null;
  }
  function arrow(ctx,x,y,toX,toY,color='#b9ffe0',width=3) {
    const angle=Math.atan2(toY-y,toX-x),head=7;
    ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();
    ctx.moveTo(x,y);ctx.lineTo(toX,toY);
    ctx.moveTo(toX-Math.cos(angle-.6)*head,toY-Math.sin(angle-.6)*head);ctx.lineTo(toX,toY);
    ctx.lineTo(toX-Math.cos(angle+.6)*head,toY-Math.sin(angle+.6)*head);ctx.stroke();
  }
  function carMark(ctx,x,y,color='#d9fff0',ghost=false) {
    ctx.save();ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=2;
    if(ghost)ctx.strokeRect(x-6,y-11,12,22);else ctx.fillRect(x-6,y-11,12,22);
    ctx.fillStyle=ghost?color:'#153e46';ctx.fillRect(x-4,y-6,8,4);
    ctx.fillStyle=color;for(const side of [-1,1])for(const yy of [-6,5])ctx.fillRect(x+side*8-1, y+yy,2,5);
    ctx.restore();
  }
  function laneDiagram(ctx,s,x,y,{lane,color='#b9ffe0',ghost=false,held=null}={}) {
    const spacing=28,current=clamp(Number(s.lanePos)||0,0,3);
    for(let i=0;i<4;i++) {
      ctx.fillStyle=i===lane?color+'25':'#102c39';ctx.fillRect(x+i*spacing,y,24,42);
      ctx.strokeStyle=i===lane?color:'#47636b';ctx.lineWidth=i===lane?2:1;
      ctx.strokeRect(x+i*spacing,y,24,42);
    }
    const carX=x+12+current*spacing,targetX=x+12+(lane??current)*spacing;
    if(!ghost&&Number.isInteger(lane)&&Math.abs(current-lane)>.38)arrow(ctx,carX,y+6,targetX,y+6,color,2);
    if(ghost)carMark(ctx,carX,y+25,color,true);
    else carMark(ctx,carX,y+25);
    if(held!=null) {ctx.fillStyle='#695a34';ctx.fillRect(x,y+47,108,3);
      ctx.fillStyle=color;ctx.fillRect(x,y+47,108*clamp(held,0,1),3);}
  }
  function routeStrip(ctx,road) {
    const s=road.state,progress=clamp(s.musicBeatFloat/400,0,1),start=84,end=354;
    panel(ctx,30,174,450,56,'#b7f2d7');tape(ctx,57,201,28,'#b7f2d7');
    fittedText(ctx,'DELIVER',82,188,110,14,'#e5fff0');
    ctx.fillStyle='#29444b';ctx.fillRect(start,213,end-start,3);
    ctx.fillStyle='#a6ebd1';ctx.fillRect(start,213,(end-start)*progress,3);
    for(const at of [.28,.52,.76]) {
      const x=start+(end-start)*at;path(ctx,[[x,209],[x+5,214],[x,219],[x-5,214]]);
      ctx.fillStyle=progress>=at?'#b7f2d7':'#47636b';ctx.fill();
    }
    // Current position and delivery flag retain meaning without a sentence.
    carMark(ctx,start+(end-start)*progress,211);
    ctx.strokeStyle=s.gateOpen?'#b9ffe0':'#d9ece7';ctx.lineWidth=2;ctx.beginPath();
    ctx.moveTo(end,200);ctx.lineTo(end,184);ctx.lineTo(end+13,188);ctx.lineTo(end,192);ctx.stroke();
    ctx.strokeStyle='#38545c';ctx.beginPath();ctx.moveTo(382,185);ctx.lineTo(382,219);ctx.stroke();
    tape(ctx,403,196,23,'#ffdd96');
    for(let i=0;i<4;i++) {
      ctx.fillStyle=i<(road.chapter?.records?.length||0)?'#ffe085':'#29444b';
      ctx.fillRect(428+(i%2)*17,188+Math.floor(i/2)*17,10,10);
    }
  }
  function exitCue(s) {
    const distance=Number.isFinite(s.gateAt)?s.gateAt-s.progress:Infinity;
    // The authored gate appears 150 units ahead. At the minimum road speed,
    // that is five seconds, inside sendEcho's six-second final-exit replay.
    // Bar 90 is preparation only; sending there would create a short replay.
    const window=distance>0&&distance<=150;
    const echo=s.echo,echoLane=Number.isFinite(echo?.lanePos)?echo.lanePos:null;
    const remaining=echo?Math.min(echo.durationMs-echo.ageMs,s.rivalDistractedMs):0;
    const live=echoLane!==null&&remaining>0;
    // Keep the real replay visible even if it was sent too soon or on the
    // exit lane. Advance the instruction only if a far-right split is still
    // possible even after a gear-down/recovery: 30 is the existing minimum
    // road speed. An ordinary pre-gate replay cannot look safely completed.
    const exit=window&&live&&echoLane<=2.25&&remaining>=distance/30*1000;
    const split=exit&&s.lanePos>=2.45&&Math.abs(echoLane-s.lanePos)>=.75;
    return {window,live,echoLane,exit,split,
      send:window&&!exit&&s.lanePos<=1.25&&s.echoEnergy>=100};
  }
  function exitDiagram(ctx,s,road) {
    const cue=exitCue(s),color='#a3f0e8',echoColor=cue.live&&!cue.exit&&cue.window?'#ffab95':color;
    panel(ctx,1470,174,420,86,color);
    // Two numbered steps show where the replay stays and where Cache must go.
    fittedText(ctx,'1',1489,191,18,15,cue.exit?'#729087':color,'center');
    fittedText(ctx,cue.window?'ECHO':'HOLD',1520,191,68,15,color);
    laneDiagram(ctx,cue.live?{lanePos:cue.echoLane}:s,1493,204,{lane:0,color:echoColor,ghost:cue.live});
    drawButton(ctx,{index:5,x:1649,y:227,size:39,active:cue.send,disabled:!cue.send,road});
    if(!cue.window) {
      // A closed register communicates saved charge without another sentence.
      ctx.strokeStyle='#cfdfdf';ctx.lineWidth=2;ctx.strokeRect(1644,231,10,8);
      ctx.beginPath();ctx.arc(1649,231,4,Math.PI,0);ctx.stroke();
    }
    arrow(ctx,1690,227,1720,227,cue.exit?'#fff5a8':'#77958f');
    const exitColor=cue.split?'#b9ffe0':cue.exit?'#fff5a8':'#94a7a5';
    fittedText(ctx,'2',1734,191,18,15,exitColor,'center');
    fittedText(ctx,'EXIT',1760,191,90,15,exitColor);
    laneDiagram(ctx,s,1758,204,{lane:3,color:exitColor});
  }
  function bossDiagram(ctx,road,options={}) {
    const s=road.state,combat=combatChase(road);
    const view=combat?(options.combatPose||s.combatPose||B.CacheRoadCombat?.pose?.(s.combat,
      {progress:s.progress,lanePos:s.lanePos,bar:s.musicBeatFloat/4})):null;
    const boss=combat?view?.boss:B.CacheRoadPursuit?.boss?.(s.pursuit,{progress:s.progress});
    if(!boss)return;
    const color=boss.defeated?'#b9ffe0':'#ff917d';
    panel(ctx,1470,174,420,86,color);
    fittedText(ctx,boss.defeated?'PURSUIT BROKEN':combat?'ATTACK THE RIG':'BREAK THE PURSUIT',1490,191,256,15,color);
    const labels=['SCAN','RAM','CORE'];
    for(let i=0;i<3;i++) {
      const broken=boss.systems?.[i]?.broken===true;
      const x=1490+i*67;
      ctx.fillStyle=broken?'#5b706b':'#ff917d';ctx.fillRect(x,211,52,27);
      ctx.strokeStyle=broken?'#b9ffe0':'#ffe4bd';ctx.lineWidth=2;
      if(broken) {ctx.beginPath();ctx.moveTo(x+9,223);ctx.lineTo(x+21,233);ctx.lineTo(x+43,214);ctx.stroke();}
      else fittedText(ctx,labels[i],x+26,225,46,12,'#152331','center');
    }
    const warning=combat?view?.actors?.find(actor=>actor.warning||actor.locked):null;
    if((combat?warning:s.rivalWarning)&&!boss.defeated) {
      // A danger map marks the attack address; it never guides the car into it.
      const target=Math.round(combat?warning.lockLane??warning.lane:s.rivalTarget),current=clamp(s.lanePos,0,3);
      fittedText(ctx,'DODGE',1794,199,108,11,color,'center');
      for(let lane=0;lane<4;lane++) {
        const x=1740+lane*28;
        ctx.fillStyle=lane===target?'#713f49':'#1b3540';ctx.fillRect(x,211,24,23);
        if(lane===target) {
          ctx.strokeStyle='#ffb9a6';ctx.lineWidth=2;ctx.beginPath();
          ctx.moveTo(x+5,216);ctx.lineTo(x+19,229);
          ctx.moveTo(x+19,216);ctx.lineTo(x+5,229);ctx.stroke();
        }
      }
      carMark(ctx,1752+current*28,243);

      const d=Math.max(0,combat?(warning.at??s.progress)-s.progress:s.nextRivalAt-s.progress);
      ctx.fillStyle='#30474b';ctx.fillRect(1740,248,108,3);
      ctx.fillStyle=color;ctx.fillRect(1740,248,108*clamp(1-d/180,0,1),3);
    } else fittedText(ctx,boss.defeated?'DELIVER':combat?'ATTACK':'COUNTER',1794,225,116,15,color,'center');
  }
  function cueDiagram(ctx,road,options,cue) {
    const s=road.state,bar=s.musicBeatFloat/4,{nextPulse,nextCue}=options;
    const combat=combatChase(road);
    if(combat&&bar>=72&&!(nextPulse&&nextCue?.ready)) {bossDiagram(ctx,road,options);return;}
    if(!combat&&road.chapter?.encounterVersion!==3&&!s.gateOpen&&(bar>=90||s.gateAt!=null&&s.progress>=s.gateAt-220)) {exitDiagram(ctx,s,road);return;}
    if(road.chapter?.encounterVersion===3&&bar>=72) {bossDiagram(ctx,road);return;}
    if(!cue)return;
    // Routine instructions live in Pause. In motion, show the lane, the
    // actual mapped button and the ONE target the player is aiming for.
    const record=cue.record?road.recordOpportunity?.():null;
    const pulse=nextPulse&&nextCue?.ready?nextPulse:null;
    const index=pulse?.action??cue.index??0,color=record?'#ffe085':cue.steer?'#b9ffe0':getBadge(index,road).color;
    panel(ctx,1550,174,340,72,color);
    const target=record?.lane??pulse?.lane;
    laneDiagram(ctx,s,1570,187,{lane:target,color,held:record?.held});
    if(cue.steer&&!pulse) {
      // No announced pad owns an action yet: teach steering without inventing
      // a mapped button that could contradict the dashboard's next preview.
      arrow(ctx,1734,209,1707,209,color);arrow(ctx,1816,209,1843,209,color);
      ctx.strokeStyle=color;ctx.lineWidth=3;ctx.beginPath();ctx.arc(1775,209,20,0,Math.PI*2);ctx.stroke();
      ctx.beginPath();ctx.arc(1775,209,4,0,Math.PI*2);ctx.moveTo(1771,207);ctx.lineTo(1757,200);
      ctx.moveTo(1779,207);ctx.lineTo(1793,200);ctx.moveTo(1775,213);ctx.lineTo(1775,229);ctx.stroke();return;
    }
    if(record) {
      tape(ctx,1750,209,39,color);
      ctx.strokeStyle='#665f42';ctx.lineWidth=5;ctx.beginPath();ctx.arc(1831,209,20,0,Math.PI*2);ctx.stroke();
      ctx.strokeStyle=color;ctx.beginPath();ctx.arc(1831,209,20,-Math.PI/2,-Math.PI/2+Math.PI*2*clamp(record.held,0,1));ctx.stroke();
      fittedText(ctx,'HOLD',1831,209,47,12,color,'center');return;
    }
    if(index===5&&!combat) {
      drawButton(ctx,{index,x:1750,y:209,size:42,active:s.echoEnergy>=100,road});
      arrow(ctx,1805,209,1854,209,color);carMark(ctx,1863,209);return;
    }
    drawButton(ctx,{index,x:1750,y:209,size:44,active:cue.active,road});
    if(cue.combat) {
      fittedText(ctx,getBadge(index,road).name,1833,205,104,15,color,'center');
      fittedText(ctx,index===4?'ON ONE':'OPENING',1833,229,104,12,'#cfdfdf','center');return;
    }
    const active=!!cue.active;
    ctx.strokeStyle=active?'#fff5a8':'#47636b';ctx.lineWidth=active?4:2;
    ctx.beginPath();ctx.arc(1836,203,19,0,Math.PI*2);ctx.stroke();
    // Four corners turn the accepted target into a clear lock, while its
    // size/address and the actual judgment window remain unchanged.
    if(active) {
      ctx.strokeStyle='#fff5a8';ctx.lineWidth=2;ctx.beginPath();
      for(const side of [-1,1])for(const vertical of [-1,1]) {
        const x=1836+side*25,y=203+vertical*25;
        ctx.moveTo(x-side*6,y);ctx.lineTo(x,y);ctx.lineTo(x,y-vertical*6);
      }
      ctx.stroke();
    }
    if(nextCue?.ready&&!active) {
      ctx.strokeStyle=color;ctx.lineWidth=3;ctx.beginPath();
      ctx.arc(1836,203,19,-Math.PI/2,-Math.PI/2+Math.PI*2*clamp(1-nextCue.remaining/4,0,1));ctx.stroke();
    }
    fittedText(ctx,'1',1836,203,25,21,active?'#fff5a8':'#cfdfdf','center');
    if(active)fittedText(ctx,'PRESS NOW',1836,233,93,12,'#fff5a8','center');
  }
  function receipt(ctx,s,road,offsetY=0) {
    const live=value=>value&&Number.isFinite(value.expiresMs)&&s.elapsedMs<value.expiresMs;
    const drive=live(s.driveFeedback)?s.driveFeedback:null,mix=live(s.mixFeedback)?s.mixFeedback:null;
    if(!drive&&!mix)return null;
    // A lane receipt belongs under a success only when both report the same
    // award. A later expiry must never appear to be the reward for a hit.
    const combined=drive&&mix&&['perfect','good'].includes(drive.kind)&&
      ['join','extend'].includes(mix.kind)&&drive.lane===mix.lane&&
      Math.abs((drive.atMs||0)-(mix.atMs||0))<=40;
    const d=combined?drive:!mix||drive&&(drive.atMs||0)>=(mix.atMs||0)?drive:mix;
    const failure=['early','late','button','lane','miss'].includes(d.kind);
    const names={perfect:'PERFECT',good:'ON BEAT',early:'TOO EARLY',late:'TOO LATE',button:'WRONG BUTTON',
      lane:'CHANGE LANE',miss:'MISSED',record:'RECORD SAVED',join:'PART IN',extend:'PART HELD',lost:'PART OUT'};
    const color=failure?'#ffab95':d.kind==='record'||d.kind==='lost'?'#ffe085':'#b9ffe0';
    const title=names[d.kind]||'READY';
    const music=combined?mix:['join','extend','lost'].includes(d.kind)?d:null;
    ctx.save();ctx.translate(0,offsetY);
    panel(ctx,30,240,370,56,color);
    if(d.kind==='record')tape(ctx,61,268,32);
    else if(Number.isInteger(d.action))drawButton(ctx,{index:d.action,x:61,y:268,size:38,active:!failure,road});
    else laneMark(ctx,d.lane,61,268,29);
    fittedText(ctx,title,91,268,188,21,color);
    if(music) {
      laneMark(ctx,music.lane,312,260,25);
      // Plus/minus/hold and a six-cell duration strip replace the part sentence.
      ctx.strokeStyle=music.kind==='lost'?'#ffe085':LANE_COLORS[music.lane];ctx.lineWidth=3;
      ctx.beginPath();ctx.moveTo(345,260);ctx.lineTo(357,260);
      if(music.kind==='join'){ctx.moveTo(351,254);ctx.lineTo(351,266);}
      if(music.kind==='extend'){ctx.moveTo(345,255);ctx.lineTo(357,255);}
      ctx.stroke();
      for(let i=0;i<6;i++) {ctx.fillStyle=i<(music.holdBars||0)&&music.kind!=='lost'?LANE_COLORS[music.lane]:'#29444b';ctx.fillRect(302+i*10,282,7,3);}
    } else if(d.kind==='early'||d.kind==='late'||d.kind==='miss') {
      ctx.strokeStyle='#6c858b';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(302,270);ctx.lineTo(372,270);ctx.stroke();
      ctx.strokeStyle='#d8ece4';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(337,257);ctx.lineTo(337,282);ctx.stroke();
      const x=d.kind==='early'?313:d.kind==='late'?361:337;
      ctx.strokeStyle=color;ctx.beginPath();ctx.moveTo(x-4,261);ctx.lineTo(x+4,269);ctx.moveTo(x+4,261);ctx.lineTo(x-4,269);ctx.stroke();
    } else if(d.kind==='lane') {
      const left=Number.isFinite(d.lane)&&d.lane<s.lanePos;
      carMark(ctx,left?361:310,268);arrow(ctx,left?348:323,268,left?307:364,268,color);
    } else if(d.kind==='button') {
      ctx.strokeStyle=color;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(322,258);ctx.lineTo(340,278);ctx.moveTo(340,258);ctx.lineTo(322,278);ctx.stroke();
    } else {
      ctx.strokeStyle=color;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(315,269);ctx.lineTo(326,278);ctx.lineTo(346,258);ctx.stroke();
    }
    ctx.restore();return {x:30,y:240+offsetY,w:370,h:56};
  }
  function draw(ctx,road,options={}) {
    if(!road?.state||road.status!=='playing')return;
    ctx.save();ctx.globalAlpha=1;
    routeStrip(ctx,road);cueDiagram(ctx,road,options,lesson(road,options));
    const meter=B.CacheRoadInstruments?.drawAdrenaline?.(ctx,road.state,{reduced:!!options.reduced});
    receipt(ctx,road.state,road,meter?84:0);ctx.restore();
  }
  function drawHelp(ctx,road) {
    ctx.save();
    if(combatChase(road)) {
      fittedText(ctx,'STEER: LEFT / RIGHT   GEAR: UP / DOWN',440,433,545,19,'#d4dfec');
      for(let i=0;i<4;i++) {
        const col=i%2,row=Math.floor(i/2),x=440+col*277,y=468+row*44,badge=getBadge(i,road);
        drawButton(ctx,{index:i,x:x+23,y:y+11,size:40,road});
        fittedText(ctx,badge.name,x+53,y,194,17,badge.color);
        fittedText(ctx,'Catch / hold a lane in the song',x+53,y+23,194,13,'#d4dfec');
      }
      fittedText(ctx,'MATCH THE PAD / PRESS ON ONE AT THE TIRES',440,558,548,17,'#a0ffe4');
      fittedText(ctx,'FULL SYNC: 2x POWER / 3x AMMO / LOWER FOOTPRINT',440,581,548,15,'#d4dfec');
      const skillIndices=[5,4,6,7],details=['Strike close / fire aligned','Launch on the next ONE','Time your guard for contact','Interrupt the enemy lock'];
      for(let i=0;i<4;i++) {
        const index=skillIndices[i],col=i%2,row=Math.floor(i/2),x=440+col*277,y=608+row*43,badge=getBadge(index,road);
        drawButton(ctx,{index,x:x+31,y:y+10,size:35,road});
        fittedText(ctx,badge.name,x+70,y-1,193,17,badge.color);
        fittedText(ctx,details[i],x+70,y+22,193,13,'#d4dfec');
      }
      fittedText(ctx,'Skills recharge independently, even with zero sync.',440,687,548,14,'#a0ffe4');
      fittedText(ctx,'ADRENALINE / 35 CHARGED / 70 RUSH',440,707,548,14,'#ffe18a');
      fittedText(ctx,'Accurate pads feed it; 2+ misses drain it. Power / recharge / guard scale.',440,728,548,13,'#d4dfec');
      fittedText(ctx,'Turbo −10 / Disrupt −14 · both usable at zero charge.',440,748,548,13,'#d4dfec');
      fittedText(ctx,'BOSS: DODGE FOR AN OPENING / ATTACK TO BREAK IT',440,767,548,14,'#d4dfec');
      tape(ctx,456,786,24);fittedText(ctx,'Optional record: hold its lane for 0.65s.',484,786,506,14,'#e7d2b3');
      ctx.restore();return;
    }
    fittedText(ctx,'STEER: LEFT / RIGHT   GEAR: UP / DOWN',440,433,545,19,'#d4dfec');
    const descriptions=['Next ONE: speed burst','Clear one contact','Absorb one hit','+40 Echo; gear 3 Turbo'];
    for(let i=0;i<4;i++) {
      const col=i%2,row=Math.floor(i/2),x=440+col*277,y=466+row*76;
      drawButton(ctx,{index:i,x:x+25,y:y+21,size:44,road});
      fittedText(ctx,BADGES[i].name,x+56,y+10,194,18,BADGES[i].color);
      fittedText(ctx,descriptions[i],x+56,y+35,194,14,'#d4dfec');
    }
    fittedText(ctx,'MATCH THE PAD  /  PRESS ON BEAT ONE',440,625,548,20,'#a0ffe4');
    fittedText(ctx,'A catch brings that lane into the song.',440,654,548,17,'#d4dfec');
    for(let i=4;i<6;i++) {
      const x=440+(i-4)*277;
      drawButton(ctx,{index:i,x:x+35,y:698,size:43,road});
      fittedText(ctx,BADGES[i].name,x+80,685,185,17,BADGES[i].color);
      fittedText(ctx,i===4?'Launch next ONE':'100% charge: replay',x+80,709,185,14,'#d4dfec');
    }
    fittedText(ctx,road.chapter?.encounterVersion===3?'BOSS: BAIT THE LOCK / DODGE OR COUNTER':'EXIT: ECHO LEFT / ORIGINAL FAR RIGHT',440,750,548,18,'#a0ffe4');
    tape(ctx,456,784,27);fittedText(ctx,'Optional record: hold its lane for 0.65s.',484,784,506,16,'#e7d2b3');
    ctx.restore();
  }
  B.CacheRoadGuidance=Object.freeze({badges:BADGES,combatBadges:COMBAT_BADGES,combatChase,getBadge,
    label,drawButton,draw,drawHelp,objective,lesson,exitCue});
})(window.BARCODE = window.BARCODE || {});
