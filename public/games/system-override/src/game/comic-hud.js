// Approved illustrated HUD and simulation-clock presentation. No new timers.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({ name: 'src/game/comic-hud.js', exports: ['BARCODE.ComicHUD', 'BARCODE.OverlayLayout'], dependencies: [] });
(function () {
  const B = window.BARCODE = window.BARCODE || {};
  const C = Object.freeze({ ink:'#0b1017', paper:'#eee8d6', green:'#c0ed55', teal:'#70efe0', purple:'#a98ee9', muted:'#a4b7b6', red:'#ed6b4e' });
  const health = Object.freeze({ x:196.25, y:128.75, width:431.25, height:36.25 });
  const lore = Object.freeze({ x:1642.5, y:138.75, width:241.25, height:53.75 });
  // Screen-space clearance shared by coaching and the terminal. Use the live
  // world projection, not world X alone: rooftop cameras and zoom move actors.
  function actorBounds(actor) {
    const boss=actor && actor===window.sector1Progression?.boss;
    const position=actor?.position || (boss ? {x:actor.x,y:actor.y} : null);
    if (!position) return null;
    const body = (boss ? window.sector1Progression.getBossHitbox?.() : actor.getHitbox?.()) || { x:position.x-40, y:position.y-80, width:80, height:160 };
    const visual = (boss ? window.sector1Progression.getBossVisualBounds?.() : actor.getVisualBounds?.()) || body, hero = actor === window.player;
    const left = Math.min(body.x, visual.x) - (hero ? 64 : 32);
    const top = Math.min(body.y, visual.y) - (hero ? 64 : 28);
    const right = Math.max(body.x+body.width, visual.x+visual.width) + (hero ? 64 : 32);
    const bottom = Math.max(body.y+body.height, visual.y+visual.height) + 4;
    const project = point => B.sceneProjection?.worldToScreen(point) || {
      x:point.x + 960 - (window.gameCamera?.centerX ?? 960), y:point.y - (window.gameCamera?.y || 0)
    };
    const points = [[left,top],[right,top],[left,bottom],[right,bottom]].map(([x,y])=>project({x,y}));
    const x = Math.min(...points.map(p=>p.x))-18, y = Math.min(...points.map(p=>p.y))-18;
    const box={ x,y,width:Math.max(...points.map(p=>p.x))+18-x,height:Math.max(...points.map(p=>p.y))+18-y };
    const viewport=B.sceneProjection?.viewport;
    if(!viewport)return box;
    const leftEdge=Math.max(box.x,viewport.x),topEdge=Math.max(box.y,viewport.y);
    return {x:leftEdge,y:topEdge,width:Math.max(0,Math.min(box.x+box.width,viewport.x+viewport.width)-leftEdge),
      height:Math.max(0,Math.min(box.y+box.height,viewport.y+viewport.height)-topEdge)};
  }
  function overlap(a,b) {
    return Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)) *
      Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
  }
  function sceneActors(primary=window.player) {
    const boss=window.sector1Progression?.boss;
    return [primary,window.player,...(window.enemyManager?.enemies || []).filter(e=>e.active),boss&&!boss.defeated?boss:null];
  }
  function reservedBounds() {
    // Health/score are above the placement area; the active beat lane extends
    // into it. Coaching must not cover the controls it is teaching.
    return window.rhythmSystem?.isActive?.() ? [{x:26,y:225,width:710,height:330}] : [];
  }
  function projectedBounds(actors) { return [...new Set(actors)].map(actorBounds).filter(Boolean).concat(reservedBounds()); }
  function isClear(box) {
    for(const actor of new Set(sceneActors())){const b=actorBounds(actor);if(b&&overlap(box,b))return false;}
    return true;
  }
  function placeOverlay(width,height,{actors=sceneActors(),previous=null,scales=[1],bounds:projected=null}={}) {
    const bounds = (projected || projectedBounds(actors)).filter(b=>b.x<1920 && b.x+b.width>0 && b.y<1080 && b.y+b.height>0);
    // Keep a clear location steady while reading or choosing a keypad button.
    if (previous && previous.width===width*(previous.scale||1) && previous.height===height*(previous.scale||1) && bounds.every(b=>!overlap(previous,b))) return {...previous,clear:true};
    let best = null, clear = null;
    for (const scale of scales) {
      const w=width*scale,h=height*scale,maxX=1894-w,maxY=1054-h;
      // Clamping can turn many actor edges into the same candidate. Visit
      // each coordinate once, retaining order and the original tie-breaking.
      const xs=[...new Set([maxX,26,(1920-w)/2,...bounds.flatMap(b=>[b.x-w-12,b.x+b.width+12])].map(x=>Math.max(26,Math.min(maxX,x))))];
      const ys=[...new Set([225,maxY,...bounds.flatMap(b=>[b.y-h-12,b.y+b.height+12])].map(y=>Math.max(225,Math.min(maxY,y))))];
      for(const y of ys) for(const x of xs) {
        const box={x,y,width:w,height:h,scale};
        let focus=0,total=0;
        for(let i=0;i<bounds.length;i++){const hit=overlap(box,bounds[i]);if(!i)focus=hit;total+=hit;}
        if (!total) {
          const distance=previous ? Math.hypot(box.x-previous.x,box.y-previous.y) : Math.hypot(box.x-maxX,box.y-225);
          if(!clear || distance<clear.distance)clear={box,distance};
        }
        if (!best || focus<best.focus || focus===best.focus && total<best.total) best={box,focus,total};
      }
      if(clear)return {...clear.box,clear:true};
    }
    return {...best.box,clear:false};
  }
  function present(owner, slot, variants, {actors=sceneActors(), preferred=null,remember=false}={}) {
    const now=window.gameState?.gameTime || 0;
    const states=owner._overlayPanels ||= {};
    let state=states[slot];
    if(state && now<state.time)state=null;
    // Projection is local to this request: all variants share current actor
    // geometry, with no stale cache across movement, zoom, pause or restart.
    const bounds=projectedBounds(actors);
    const fits=box=>bounds.every(b=>!overlap(box,b));
    const matches=box=>variants.some(v=>v.width*(v.scale||1)===box.width && v.height*(v.scale||1)===box.height && !!v.compact===!!box.compact);
    let destination=state?.to;
    if(!destination || destination.docked || !matches(destination) || !fits(destination)) {
      destination=null;
      for(const v of variants) {
        const box=placeOverlay(v.width,v.height,{actors,bounds,previous:state?.to || preferred,scales:[v.scale||1]});
        if(box.clear){destination={...box,compact:!!v.compact};break;}
      }
      if(!destination)destination={...placeOverlay(440,70,{actors,bounds,previous:state?.to}),docked:true};
      // After a crowded scene, wait for a sustained opening instead of
      // repeatedly opening/closing a full paragraph between passing enemies.
      if(state?.to.docked && !destination.docked) {
        state.openSince ??= now;
        if(now-state.openSince<350)destination=state.to;
      } else if(state)state.openSince=null;
    }
    // Dialogue/task panels remember a few genuinely settled positions. A
    // previously useful home must be clear for a full second before returning.
    // The existing glide, cutouts and reading protection still own that move.
    const homes=state?.homes || [];
    if(remember && state && !state.to.docked) {
      const elapsed=Math.max(0,Math.min(100,now-state.time));
      for(const home of homes) {
        if(matches(home.box)&&fits(home.box))home.clearMs+=elapsed;else home.clearMs=0;
      }
      if(now-state.start>=1500 && fits(state.shown)) {
        let home=homes.find(h=>matches(h.box)&&Math.hypot(h.box.x-state.to.x,h.box.y-state.to.y)<24);
        if(!home){home={box:{...state.to},dwell:0,clearMs:0};homes.push(home);if(homes.length>6)homes.splice(homes.reduce((min,h,i)=>h.dwell<homes[min].dwell?i:min,0),1);}
        home.dwell=Math.min(30000,home.dwell+elapsed);
        const best=homes.filter(h=>matches(h.box)&&h.clearMs>=1000&&h.dwell>home.dwell+1500&&fits(h.box)).sort((a,b)=>b.dwell-a.dwell)[0];
        if(best && now-state.start>=2500)destination={...best.box};
      }
    }
    const changed=!state || ['x','y','width','height','scale','compact','docked'].some(k=>state.to[k]!==destination[k]);
    if(changed) {
      const from=state?.shown || destination;
      state=states[slot]={from,to:destination,start:now,time:now,shown:from,lastOccluded:state?.lastOccluded,homes};
    }
    state.time=now;
    const reduced=B.Preferences?.values.reducedMotion;
    const t=Math.min(1,Math.max(0,(now-state.start)/260)),ease=t*t*(3-2*t);
    // Reshaping uses a brief signal dissolve; text is reflowed at its final
    // readable size, never squeezed or scaled through intermediate widths.
    const reshape=state.from.width!==state.to.width || state.from.height!==state.to.height;
    const box={...state.to,x:reduced?state.to.x:state.from.x+(state.to.x-state.from.x)*ease,
      y:reduced?state.to.y:state.from.y+(state.to.y-state.from.y)*ease};
    box.x=Math.max(26,Math.min(1894-box.width,box.x));
    box.y=Math.max(225,Math.min(1054-box.height,box.y));
    const clear=fits(box);
    if(!clear)state.lastOccluded=now;
    const recover=reduced||state.lastOccluded===undefined?1:Math.min(1,0.22+0.78*(now-state.lastOccluded)/120);
    const alpha=clear?Math.min(recover,reshape&&!reduced?0.35+0.65*ease:1):0.22;
    const moving=!reduced && t<1 && (reshape || Math.hypot(state.from.x-state.to.x,state.from.y-state.to.y)>1);
    state.shown=box;
    return {...box,clear,alpha,moving,readable:clear&&!box.docked&&alpha>=0.9,
      cutouts:bounds.filter(b=>overlap(box,b))};
  }
  function beginOverlay(ctx, layout) {
    ctx.globalAlpha *= layout.alpha ?? 1;
    // Subtract each actor separately. A single even-odd path for overlapping
    // enemies would XOR their overlap and paint the panel back over them.
    for(const b of layout.cutouts || []) {
      ctx.beginPath();ctx.rect(0,0,1920,1080);ctx.rect(b.x,b.y,b.width,b.height);ctx.clip('evenodd');
    }
  }
  function drawDock(ctx, layout, title, detail='Message held • resumes when clear') {
    ctx.fillStyle='#080f1c';ctx.fillRect(layout.x,layout.y,layout.width,layout.height);
    ctx.fillStyle=C.teal;ctx.fillRect(layout.x,layout.y,4,layout.height);
    text(ctx,title,layout.x+18,layout.y+23,22,C.paper,700,'left',layout.width-36);
    text(ctx,detail,layout.x+18,layout.y+49,18,C.muted,600,'left',layout.width-36);
  }
  B.OverlayLayout=Object.freeze({actorBounds,actors:sceneActors,isClear,overlap,place:placeOverlay,present,begin:beginOverlay,drawDock});
  function polygon(c, points, fill, stroke, width=2) {
    c.beginPath(); points.forEach((p,i)=>i ? c.lineTo(...p) : c.moveTo(...p)); c.closePath();
    c.fillStyle=fill; c.fill(); if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}
  }
  function plate(c,x,y,w,h,fill=C.ink,edge=C.paper) {
    polygon(c,[[x+7,y+7],[x+w+7,y+3],[x+w-5,y+h+7],[x+3,y+h+4]],'#03070c');
    polygon(c,[[x,y+3],[x+w-14,y],[x+w,y+14],[x+w-4,y+h],[x+9,y+h-3],[x,y+h-15]],fill,edge);
  }
  function text(c,t,x,y,size=22,color=C.paper,weight=600,align='left',maxWidth) {
    c.font=`${weight} ${size}px Oxanium, monospace`;c.fillStyle=color;c.textAlign=align;c.textBaseline='middle';
    if(maxWidth) c.fillText(String(t),x,y,maxWidth); else c.fillText(String(t),x,y);
  }
  function buttonText(c,value,x,y,width,height,padding=4) {
    // Center the visible glyph, not a caller's inherited canvas baseline.
    // Actual ink bounds also center triangle/cross and multi-letter labels.
    c.save();c.textAlign='left';c.textBaseline='alphabetic';
    const label=String(value),m=c.measureText(label);
    const a=m.actualBoundingBoxAscent,d=m.actualBoundingBoxDescent;
    if(Number.isFinite(a)&&Number.isFinite(d)&&a+d>0 &&
      Number.isFinite(m.actualBoundingBoxLeft)&&Number.isFinite(m.actualBoundingBoxRight)) {
      const left=m.actualBoundingBoxLeft,right=m.actualBoundingBoxRight;
      const scale=Math.min(1,Math.max(1,width-padding*2)/Math.max(1,left+right),Math.max(1,height-padding*2)/(a+d));
      c.translate(x+width/2,y+height/2);c.scale(scale,scale);
      c.fillText(label,(left-right)/2,(a-d)/2);
    } else {
      c.textAlign='center';c.textBaseline='middle';
      c.fillText(label,x+width/2,y+height/2,Math.max(1,width-padding*2));
    }
    c.restore();
  }
  function barcode(c,x,y,w,h,fill) {
    let at=x,n=0;c.fillStyle=fill;
    while(at<x+w){const bw=[3,5,2,7,3,2,5][n++%7];c.fillRect(at,y,Math.min(bw,x+w-at),h);at+=bw+2;}
  }
  function begin(c) { c.save();c.globalAlpha=1;c.shadowBlur=0;c.scale(1.25,1.25); }
  function portraitFrame(player, rhythm) {
    if (player?.hudReaction?.kind === 'hurt') return 1;
    if (window.gameState?.victory || player?.hudReaction?.kind === 'relief') return 5;
    if ((player?.health || 0) <= 1) return 4;
    const combo = rhythm?.getCombo?.() ?? rhythm?.combo ?? 0;
    if (rhythm?.isActive?.()) return combo >= 5 && combo % 5 < 3 ? 2 : 3;
    return 0;
  }
  function portraitMotion(player, rhythm) {
    const preferences=B.Preferences?.values;
    if(preferences?.reducedMotion || preferences?.flashes===false || window.BARCODE_RENDER_QUALITY?.flashes===false)
      return {x:0,angle:0,scaleY:1,blink:0};
    // The HUD shares the paused simulation clock, but has its own readable
    // cadence. Emotional cels continue to describe health/combat, not a loop.
    const now=Math.max(0,window.gameState?.gameTime || 0), frame=portraitFrame(player,rhythm);
    const breathMs=frame===4?1600:frame===2||frame===3?2100:frame===5?3400:2800;
    const swayMs=frame===2||frame===3?3600:5200;
    const phase=now/breathMs*Math.PI*2, sway=now/swayMs*Math.PI*2;
    const blinkTime=now%5300;
    const blink=frame===0 && blinkTime>=4050 && blinkTime<4230 ? Math.sin((blinkTime-4050)/180*Math.PI) : 0;
    return {x:Math.sin(sway)*2.4,angle:Math.sin(sway)*.018,scaleY:1+(.5-.5*Math.cos(phase))*.024,blink};
  }
  function drawPortrait(c, player, rhythm) {
    const frame=portraitFrame(player,rhythm), motion=portraitMotion(player,rhythm);
    // Anchor at the shoulder line; breathing lifts the head without moving
    // the frame, health marks or name. Clipping also covers the fallback art.
    c.save();c.translate(85.5+motion.x,152);c.rotate(motion.angle);c.scale(1,motion.scaleY);c.translate(-85.5,-152);
    const bounds={x:85.5,y:88.5,width:127,height:127};
    const illustrated=B.PresentationAssets?.draw('hudExpressions',c,{...bounds,frame});
    if(!illustrated && !B.PresentationAssets?.draw('hudPortrait',c,bounds)) text(c,'6 BIT',84,90,27,C.paper,700,'center');
    if(illustrated && motion.blink>0) {
      // Reuse only the already-painted closed eyes from the hurt cel. The
      // neutral mouth, brows and selected expression never change for a blink.
      c.save();c.beginPath();
      for(const eye of [[[59,73],[81,73],[83,84],[59,85]],[[91,73],[115,73],[113,85],[90,84]]]) {
        eye.forEach((point,index)=>index?c.lineTo(...point):c.moveTo(...point));c.closePath();
      }
      c.clip();c.globalAlpha*=motion.blink;B.PresentationAssets?.draw('hudExpressions',c,{...bounds,frame:1});c.restore();
    }
    c.restore();
  }
  function basic(c, { player, rhythm, progress, score, pad, training }) {
    begin(c);
    const active=!!rhythm?.isActive?.(), max=Math.max(1,player?.maxHealth||3), hp=Math.max(0,Math.min(max,player?.health||0));
    plate(c,22,22,508,139);
    polygon(c,[[27,29],[144,27],[135,154],[31,154]],'#253441',C.paper);
    c.save();c.beginPath();c.rect(31,29,106,123);c.clip();
    drawPortrait(c,player,rhythm);
    c.restore();
    text(c,'6 BIT',157,51,32,C.paper,700);
    text(c,active?'RHYTHM COMBAT':'SIGNAL ACTIVE',505,53,16,active?C.green:C.muted,600,'right');
    text(c,'HEALTH',157,84,16,C.muted);text(c,`${hp} / ${max}`,506,84,18,C.paper,600,'right');
    const segment=345/max;
    for(let i=0;i<max;i++) {
      const x=157+i*segment, w=segment-8;
      polygon(c,[[x,103],[x+w,103],[x+w-8,132],[x-8,132]],i<hp?'#27372a':'#302731');
      barcode(c,x+1,106,w-10,22,i<hp?C.green:'#503c46');
      const repair = window.sector1Progression?.repairFeedback;
      if(repair && i===hp-1) {
        c.save(); c.globalAlpha=(1-repair.age/900)*(0.45+0.35*Math.cos(repair.age/75));
        c.fillStyle=C.paper;c.fillRect(x+1,106,w-10,22);c.restore();
      }
    }
    c.fillStyle=C.purple;c.fillRect(156,146,346,3);
    plate(c,1200,23,310,76,C.paper,C.ink);
    text(c,'SCORE',1220,42,16,C.ink);text(c,String(Math.max(0,score||0)).padStart(6,'0'),1488,64,31,C.ink,700,'right',260);
    plate(c,1314,111,193,43);text(c,'LORE',1330,132,16,C.muted);text(c,`${progress?.collected||0} / ${progress?.total||3}`,1488,132,23,C.paper,600,'right');
    if(!active && !training && !window.hackingSystem?.isActive?.() && !B.stageFX?.ratEvent && isClear({x:32.5,y:223.75,width:277,height:54})){plate(c,26,179,213,36,C.ink,C.muted);text(c,`[${B.ControllerSettings?.prompt('rhythm_mode', 'R') || 'R'}] RHYTHM MODE`,43,197,17);}
    if(progress?.saved===false) text(c,'ARCHIVE SAVE UNAVAILABLE — KEEP TAB OPEN',26,active?448:312,12,'#ffc68a',600,'left',500);
    if(training) text(c,'DEAD AIR DISTRICT / CREW TRAINING',810,158,16,C.purple,600,'center',530);
    c.restore();
  }
  function wrapped(c, value, width, size, weight = 600) {
    c.font = `${weight} ${size}px Oxanium, monospace`;
    const lines = []; let line = '';
    for (const word of String(value || '').split(' ')) {
      const next = line ? line + ' ' + word : word;
      if (line && c.measureText(next).width > width) { lines.push(line); line = word; }
      else line = next;
    }
    if (line) lines.push(line);
    return lines;
  }
  const objectiveMotion={};
  function actionCard(c, { title, control, label, detail, progress, hint }, { x = 1328, y = 225, width = 564 } = {}) {
    c.save(); c.globalAlpha = 1; c.shadowBlur = 0;
    const inner = width - 48, titles = wrapped(c, title, inner, 36, 700), details = wrapped(c, detail, inner, 28);
    const progressLines = wrapped(c, progress, inner, 26);
    const hintLines = hint ? wrapped(c, hint.detail, inner, 26) : [];
    const hintTitles = hint ? wrapped(c, (hint.control ? '[' + hint.control + '] ' : '') + hint.title, inner, 28, 700) : [];
    const height = 60 + titles.length * 40 + details.length * 34 + (control ? 68 : 0) + progressLines.length * 32 +
      (hint ? 20 + hintTitles.length * 34 + hintLines.length * 32 : 0);
    const layout=present(objectiveMotion,'objectives',[{width:width+8,height:height+8}],{preferred:{x,y,width:width+8,height:height+8,scale:1},remember:true});
    beginOverlay(c,layout);
    if(layout.docked){drawDock(c,layout,title,control?`[${control}] ${label||''}`:'Objective retained');c.restore();return;}
    x=layout.x;y=layout.y;
    plate(c, x, y, width, height, C.ink, C.muted);
    text(c, 'OBJECTIVES', x + 24, y + 25, 22, C.green, 700);
    let row = y + 64;
    for (const line of titles) { text(c, line, x + 24, row, 36, C.paper, 700); row += 40; }
    if (control) {
      c.font = 'bold 36px Oxanium, monospace';
      const badgeWidth = Math.max(72, c.measureText(control).width + 30);
      c.fillStyle = C.green; c.fillRect(x + 24, row + 1, badgeWidth, 50);
      c.fillStyle=C.ink;buttonText(c,control,x+24,row+1,badgeWidth,50,8);
      if (label) text(c, label, x + 40 + badgeWidth, row + 26, 30, C.paper, 700);
      row += 68;
    }
    for (const line of details) { text(c, line, x + 24, row, 28, C.paper); row += 34; }
    for (const line of progressLines) { text(c, line, x + 24, row + 2, 26, C.teal); row += 32; }
    if (hint) {
      c.fillStyle = '#334653'; c.fillRect(x + 24, row, inner, 2); row += 22;
      for (const line of hintTitles) { text(c, line, x + 24, row, 28, C.green, 700); row += 34; }
      for (const line of hintLines) { text(c, line, x + 24, row, 26, C.paper); row += 32; }
    }
    c.restore();
  }
  function objectives(c,{ title, detail }) {
    actionCard(c, { title, detail, hint: window.tutorialSystem?.getContextHint?.() });
  }
  function boss(c,status) {
    begin(c);const counter=!!status.canReceiveDamage,color=counter?C.teal:C.red;
    plate(c,585,26,580,111,C.ink,color);
    text(c,'SECTOR 1 BOSS',607,51,24,C.paper,700);
    const phase=counter?'COUNTER WINDOW':status.phase==='ready'?'GET READY':status.attackPattern==='slam'?'MARKED SLAM':status.doublePulse?'DOUBLE PULSE':'GROUND PULSE';
    text(c,phase,1142,51,17,color,700,'right',290);
    const ratio=Math.max(0,Math.min(1,status.health/Math.max(1,status.maxHealth)));
    for(let i=0;i<12;i++) { c.fillStyle='#27333c';c.fillRect(607+i*44,78,37,17);const fill=Math.max(0,Math.min(1,ratio*12-i));c.fillStyle=color;c.fillRect(607+i*44,78,37*fill,17); }
    const cue=counter?(status.canStompCounter?'TIMED HIT OR LANDING STOMP':'TIMED HIT · STOMP UNAVAILABLE'):status.attackPattern==='slam'?'MOVE OUT OF THE MARKED COLUMN.':status.doublePulse?'JUMP BOTH PULSES. WATCH FOR CYAN.':'JUMP THE PULSE. WATCH FOR CYAN.';
    text(c,cue,607,117,16,C.paper,600,'left',535);c.restore();
  }
  function rhythm(c,{ lane, pattern, pad, combo, established, tempoBeat, tempoBeats }) {
    begin(c);const color=pattern==='discharge'?C.purple:pattern==='wave'?C.teal:C.green;
    plate(c,24,183,554,170,C.ink,color);
    polygon(c,[[24,186],[330,183],[314,217],[26,221]],color);
    text(c,'RHYTHM COMBAT',42,204,22,C.ink,700);text(c,`[${B.ControllerSettings?.prompt('rhythm_mode', 'R') || 'R'}] EXIT`,554,205,17,C.paper,600,'right');
    c.fillStyle='#1b2930';c.fillRect(46,243,330,53);
    c.save();c.beginPath();c.rect(46,243,330,53);c.clip();
    c.strokeStyle='#536968';c.lineWidth=1;c.beginPath();c.moveTo(46,270);c.lineTo(376,270);c.stroke();
    // Existing transport-derived note coordinates are mapped into the new lane.
    // The same x=96 beat crossing still hits the fixed target exactly.
    for(const note of lane.notes) {
      const x=152+(note.x-96)*(52/82), onTarget=Math.abs(note.x-96)<6;
      const resultColor = note.timing === 'perfect' ? C.teal : note.timing === 'excellent' ? C.green : note.timing === 'miss' ? C.red : null;
      polygon(c,[[x-5,252],[x+9,252],[x+4,287],[x-10,287]],resultColor || (onTarget?C.paper:note.downbeat?color:C.muted));
      if(resultColor) text(c,note.timing==='miss'?'×':'✓',x,269,16,C.ink,700,'center');
      if(note.downbeat) barcode(c,x-3,255,8,29,C.ink);
    }
    c.restore();c.fillStyle=C.paper;c.fillRect(150.5,235,3,68);
    polygon(c,[[141,231],[162,231],[152,241]],C.paper);
    text(c,B.ControllerSettings?.prompt('primary', 'DOWN') || 'DOWN',46,325,19,C.paper,700);
    text(c,!lane.ready?'WAITING FOR MUSIC':!established?`FIND THE BEAT ${tempoBeat}/${tempoBeats}`:'HIT ON THE MARK',120,325,15,C.muted,600,'left',252);
    text(c,'COMBO',413,242,16,C.muted);text(c,pattern.toUpperCase(),554,242,11,C.muted,600,'right',81);
    text(c,combo,480,288,String(combo).length>3?48:70,color,700,'center',150);
    text(c,combo>=10?'CHAIN · 2 MAX':combo>=5?`${10-combo} TO DISCHARGE`:`${5-combo} TO WAVE`,554,328,15,color,700,'right',178);
    c.restore();
  }
  function amp(c,{charges,notice,visible,active}) {
    if(!visible)return;begin(c);const y=active?368:229;
    plate(c,25,y,303,63,C.ink,C.muted);text(c,charges?'AMP':'AMP EMPTY',43,y+21,18,C.paper);
    for(let i=0;i<3;i++) polygon(c,[[184+i*37,y+12],[214+i*37,y+12],[209+i*37,y+30],[179+i*37,y+30]],i<charges?C.purple:'#313440');
    const message=notice?.kind==='pickup'?'3 HITS · LONGER ENEMY REACH':notice?.kind==='empty'?'DEPLETED · NORMAL REACH':charges?'ON-BEAT HITS: ENEMY REACH +':'NORMAL REACH';
    text(c,message,43,y+47,12,C.muted,600,'left',269);c.restore();
  }
  function hack(c, notice) {
    if (!notice || !(notice.alpha > 0)) return;
    if(!isClear({x:731.25,y:193.75,width:304,height:63}))return;
    begin(c); c.globalAlpha *= notice.alpha;
    // Brief notice in the top gap: above the playfield, below a boss readout,
    // and outside the left health/rhythm/Amp stack.
    const x=585, y=155, w=235, key=B.ControllerSettings?.prompt('interact','H') || 'H';
    plate(c,x,y,w,42,C.ink,C.green);
    text(c,`[${key}] HACK READY`,x+w/2,y+21,21,C.green,700,'center',w-24);
    c.restore();
  }
  B.ComicHUD=Object.freeze({health,lore,C,polygon,plate,text,buttonText,basic,objectives,actionCard,portraitFrame,portraitMotion,boss,rhythm,amp,hack});
})();
